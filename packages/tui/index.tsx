/** @jsxImportSource @opentui/react */
import { initLogger, isFirstRun, saveTelemetryPreference, trackEvent } from "@repo/logger";

await initLogger();

if (isFirstRun()) {
  console.log(
    "Relic collects anonymous usage data to improve the product. Run `relic telemetry disable` to opt out.",
  );
  saveTelemetryPreference(true);
}

if (process.env.DEV === "true") {
  try {
    const devtools = await import("react-devtools-core");
    devtools.connectToDevTools({ host: "localhost", port: 8097 });
  } catch {
    // DevTools connection is optional
  }
}

import { ConsolePosition, createCliRenderer } from "@opentui/core";
import { createRoot, useRenderer } from "@opentui/react";
import {
  clearCachedUserKeys,
  clearPassword,
  clearSession,
  extractErrorMessage,
  getUserKeyCacheDb,
  hasPasswordForAccount,
  savePassword,
  validateSession,
  watchSession,
} from "@repo/auth";
import { createLogger } from "@repo/logger";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { TaskBar } from "./components/shared/TaskBar";
import { AppProvider, useUser } from "./context";
import { ConvexAuthProvider } from "./convex/provider";
import { AppSessionContext } from "./hooks/useAppSession";
import { TaskProvider } from "./hooks/useTaskQueue";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PasswordSetupPage } from "./pages/PasswordSetupPage";
import { ProjectPage } from "./pages/ProjectPage";
import { RouterProvider, useRouter } from "./router";
import { getUserDisplayName } from "./utils/mappers";

const logger = createLogger("tui");

const PASSWORD_RECHECK_DELAY_MS = 1000;

function AuthenticatedApp({ onLogout }: { onLogout: () => Promise<void> }) {
  const renderer = useRenderer();
  const { route, navigate } = useRouter();
  const { user, isLoading: isUserLoading } = useUser();
  const displayName = user ? getUserDisplayName(user) : "User";
  const hasExistingKeys = !!user?.publicKey && !!user?.encryptedPrivateKey && !!user?.salt;

  const [passwordStatus, setPasswordStatus] = useState<{ isReady: boolean; loading: boolean }>({
    isReady: false,
    loading: true,
  });
  const isPasswordReadyRef = useRef(false);
  isPasswordReadyRef.current = passwordStatus.isReady;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const checkPassword = async () => {
      if (isUserLoading) {
        return;
      }

      if (!user || !hasExistingKeys) {
        if (!cancelled) {
          setPasswordStatus({ isReady: false, loading: false });
        }
        return;
      }

      const isReady = await hasPasswordForAccount({
        userId: user.id,
        email: user.email,
        encryptedPrivateKey: user.encryptedPrivateKey,
        salt: user.salt,
      }).catch(() => false);

      if (!cancelled) {
        setPasswordStatus({ isReady, loading: false });
      }
    };

    if (isPasswordReadyRef.current) {
      // NOTE: Keys changed while unlocked (e.g. a password change). Keep the current page mounted
      // and give the local password save a moment to land before re-checking.
      timer = setTimeout(() => void checkPassword(), PASSWORD_RECHECK_DELAY_MS);
    } else {
      setPasswordStatus({ isReady: false, loading: true });
      void checkPassword();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    hasExistingKeys,
    isUserLoading,
    user?.email,
    user?.encryptedPrivateKey,
    user?.id,
    user?.salt,
  ]);

  const handleLogout = useCallback(async () => {
    await onLogout();
    navigate({ name: "login" });
  }, [onLogout, navigate]);

  const handlePasswordSetup = async (password: string) => {
    await savePassword(
      password,
      user
        ? {
            userId: user.id,
            email: user.email,
          }
        : undefined,
    );
    trackEvent("password_setup_completed", { success: true });
    setPasswordStatus({ isReady: true, loading: false });
    navigate({ name: "home" });
  };

  const requireUnlock = useCallback(() => {
    setPasswordStatus({ isReady: false, loading: false });
  }, []);

  const isUnlocked =
    !isUserLoading &&
    !!user &&
    !passwordStatus.loading &&
    hasExistingKeys &&
    passwordStatus.isReady;
  const isPreAuthRoute =
    route.name === "login" || route.name === "password-setup" || route.name === "password-unlock";

  useEffect(() => {
    if (isUnlocked && isPreAuthRoute) navigate({ name: "home" });
  }, [isUnlocked, isPreAuthRoute, navigate]);

  if (isUserLoading || !user || passwordStatus.loading) {
    return null;
  }

  if (!hasExistingKeys || !passwordStatus.isReady) {
    return (
      <>
        <PasswordSetupPage
          hasExistingKeys={hasExistingKeys}
          onComplete={handlePasswordSetup}
          onLogout={handleLogout}
        />
        <AuthenticatedTaskBar />
      </>
    );
  }

  const sessionContext = {
    logout: handleLogout,
    displayName,
    requireUnlock,
  };

  const renderPage = () => {
    switch (route.name) {
      case "login":
      case "password-setup":
      case "password-unlock":
        return null;
      case "project":
        return (
          <ProjectPage
            projectId={route.projectId}
            projectName={route.projectName}
            projectStatus={route.projectStatus}
          />
        );
      default:
        return <HomePage />;
    }
  };

  return (
    <AppSessionContext.Provider value={sessionContext}>
      <ErrorBoundary
        key={route.name === "project" ? `project:${route.projectId}` : route.name}
        onRecover={() => navigate({ name: "home" })}
        onQuit={() => renderer.destroy()}
      >
        {renderPage()}
      </ErrorBoundary>
      <AuthenticatedTaskBar />
    </AppSessionContext.Provider>
  );
}

// NOTE: TaskBar wrapper that has access to user context.
function AuthenticatedTaskBar() {
  const { user, hasPro } = useUser();
  return <TaskBar userEmail={user?.email} hasPro={hasPro} />;
}

function AppRouter() {
  const { navigate } = useRouter();
  const [authState, setAuthState] = useState<{
    isAuthenticated: boolean;
    isLoading: boolean;
  }>({ isAuthenticated: false, isLoading: true });

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      try {
        const validation = await validateSession();
        setAuthState({ isAuthenticated: validation.isValid, isLoading: false });
      } catch {
        setAuthState({ isAuthenticated: false, isLoading: false });
      }

      cleanup = await watchSession(async (event) => {
        if (event === "deleted") {
          setAuthState({ isAuthenticated: false, isLoading: false });
        } else if (event === "created") {
          const validation = await validateSession();
          if (validation.isValid) {
            setAuthState({ isAuthenticated: true, isLoading: false });
          }
        }
      });
    };

    setup().catch((error: unknown) => {
      logger.error("Failed to watch session:", error);
    });

    return () => cleanup?.();
  }, []);

  const handleLogin = useCallback(async () => {
    const validation = await validateSession().catch(() => ({ isValid: false }));
    setAuthState({ isAuthenticated: validation.isValid, isLoading: false });
    navigate({ name: "home" });
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    const userKeyDb = await getUserKeyCacheDb();
    clearCachedUserKeys(userKeyDb);
    await clearSession();
    await clearPassword();
    setAuthState({ isAuthenticated: false, isLoading: false });
  }, []);

  if (authState.isLoading) {
    return null;
  }

  if (!authState.isAuthenticated) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <TaskBar />
      </>
    );
  }

  return (
    <ConvexAuthProvider>
      <AppProvider>
        <AuthenticatedApp onLogout={handleLogout} />
      </AppProvider>
    </ConvexAuthProvider>
  );
}

function App() {
  return (
    <TaskProvider>
      <RouterProvider>
        <AppRouter />
      </RouterProvider>
    </TaskProvider>
  );
}

trackEvent("tui_launched", { source: process.env._RELIC_FROM_CLI ? "cli" : "standalone" });

const isDev = process.env.DEV === "true";

const EXIT_CODE_INTERRUPTED = 130;
const EXIT_CODE_CRASHED = 1;

let exitCode = 0;
let crashError: unknown = null;

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  openConsoleOnError: isDev,
  ...(isDev && {
    consoleOptions: {
      position: ConsolePosition.BOTTOM,
      sizePercent: 30,
    },
  }),
});

// NOTE: The renderer destroys itself on Ctrl+C / SIGINT on the next tick; record why first.
renderer.keyInput.on("keypress", (key) => {
  if (key.ctrl && key.name === "c") exitCode = EXIT_CODE_INTERRUPTED;
});
process.on("SIGINT", () => {
  exitCode = EXIT_CODE_INTERRUPTED;
});

// NOTE: In dev the renderer's own handler opens the console instead, so keep the app alive there.
if (!isDev) {
  process.on("uncaughtException", (error) => {
    crashError = error;
    exitCode = EXIT_CODE_CRASHED;
    if (!renderer.isDestroyed) renderer.destroy();
  });
}

// Wait for terminal restore to finish before exiting
renderer.on("destroy", () =>
  setTimeout(() => {
    if (crashError) console.error("Relic crashed:", extractErrorMessage(crashError));
    process.exit(exitCode);
  }, 50),
);
createRoot(renderer).render(<App />);
