import { initLogger } from "./utils/debugLog";

initLogger();

if (process.env.DEV === "true") {
  try {
    const devtools = await import("react-devtools-core");
    devtools.connectToDevTools({ host: "localhost", port: 8097 });
  } catch {
    // DevTools connection is optional
  }
}

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import {
  clearCachedUserKeys,
  clearPassword,
  clearSession,
  getUserKeyCacheDb,
  hasPassword,
  savePassword,
  validateSession,
  watchSession,
} from "@repo/auth";
import { useCallback, useEffect, useState } from "react";
import { TaskBar } from "./components/shared/TaskBar";
import { AppProvider, useUser } from "./context";
import { ConvexAuthProvider } from "./convex/provider";
import { AppSessionContext } from "./hooks/useAppSession";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { TaskProvider } from "./hooks/useTaskQueue";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PasswordSetupPage } from "./pages/PasswordSetupPage";
import { ProjectPage } from "./pages/ProjectPage";
import { RouterProvider, useRouter } from "./router";

function AuthenticatedApp({ onLogout }: { onLogout: () => Promise<void> }) {
  const { route, navigate } = useRouter();
  const { displayName } = useCurrentUser();

  const [passwordStatus, setPasswordStatus] = useState<{ has: boolean; loading: boolean }>({
    has: false,
    loading: true,
  });

  useEffect(() => {
    const checkPassword = async () => {
      const has = await hasPassword();
      setPasswordStatus({ has, loading: false });
    };
    checkPassword();
  }, []);

  const handleLogout = useCallback(async () => {
    await onLogout();
    navigate({ name: "login" });
  }, [onLogout, navigate]);

  const handlePasswordSetup = async (password: string) => {
    await savePassword(password);
    setPasswordStatus({ has: true, loading: false });
    navigate({ name: "home" });
  };

  if (passwordStatus.loading) {
    return null;
  }

  if (!passwordStatus.has) {
    return (
      <>
        <PasswordSetupPage onComplete={handlePasswordSetup} onLogout={handleLogout} />
        <AuthenticatedTaskBar />
      </>
    );
  }

  const sessionContext = {
    logout: handleLogout,
    displayName,
  };

  const renderPage = () => {
    switch (route.name) {
      case "login":
      case "password-setup":
      case "password-unlock":
        navigate({ name: "home" });
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
      {renderPage()}
      <AuthenticatedTaskBar />
    </AppSessionContext.Provider>
  );
}

// NOTE: TaskBar wrapper that has access to user context.
function AuthenticatedTaskBar() {
  const { user } = useUser();
  return <TaskBar userEmail={user?.email} />;
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

    setup();

    return () => cleanup?.();
  }, []);

  const handleLogin = useCallback(async () => {
    const validation = await validateSession();
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

const renderer = await createCliRenderer({ exitOnCtrlC: true });
// Wait for terminal restore to finish before exiting
renderer.on("destroy", () => setTimeout(() => process.exit(0), 50));
createRoot(renderer).render(<App />);
