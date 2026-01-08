import { initLogger, logger } from "./utils/debugLog";

console.log("DEBUG: Before initLogger");
initLogger();
console.log("DEBUG: After initLogger");
logger.log("App starting - logger initialized");
console.log("DEBUG: After first logger.log");

if (process.env.DEV === "true") {
  try {
    const devtools = await import("react-devtools-core");
    devtools.connectToDevTools({
      host: "localhost",
      port: 8097,
    });
    logger.log("Attempted to connect to React DevTools");
  } catch (err) {
    logger.error("Failed to connect to React DevTools", err);
  }
}

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { TaskBar } from "./components/shared";
import { AuthProvider, useAuth } from "./convex";
import { AppSessionContext } from "./hooks/useAppSession";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { TaskProvider } from "./hooks/useTaskQueue";
import { HomePage, LoginPage, PasswordSetupPage, PasswordUnlockPage, ProjectPage } from "./pages";
import { RouterProvider, useRouter } from "./router";
import { clearPassword, hasPassword, savePassword } from "./utils/passwordStorage";

function AppRouter() {
  logger.log("AppRouter rendered");
  const { isAuthenticated, isLoading: isAuthLoading, refreshAuth, logout: authLogout } = useAuth();
  const { route, navigate } = useRouter();
  const { displayName } = useCurrentUser();

  logger.log("AppRouter state:", { isAuthenticated, isAuthLoading });

  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(false);
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
    await authLogout();
    await clearPassword();
    setIsPasswordUnlocked(false);
    navigate({ name: "login" });
  }, [authLogout, navigate]);

  const handlePasswordSetup = async (password: string) => {
    await savePassword(password);
    setPasswordStatus({ has: true, loading: false });
    setIsPasswordUnlocked(true);
    navigate({ name: "home" });
  };

  const handlePasswordUnlock = () => {
    setIsPasswordUnlocked(true);
    navigate({ name: "home" });
  };

  const handleLogin = async () => {
    await refreshAuth();
    const has = await hasPassword();
    setPasswordStatus({ has, loading: false });
    if (has) {
      navigate({ name: "password-unlock" });
    } else {
      navigate({ name: "password-setup" });
    }
  };

  if (isAuthLoading || passwordStatus.loading) {
    return null;
  }

  if (!isAuthenticated) {
    logger.log("AppRouter: Not authenticated, showing LoginPage");
    return <LoginPage onLogin={handleLogin} />;
  }

  if (!isPasswordUnlocked) {
    logger.log("AppRouter: Password not unlocked, passwordStatus:", passwordStatus);
    if (passwordStatus.has) {
      return <PasswordUnlockPage onUnlock={handlePasswordUnlock} onLogout={handleLogout} />;
    }
    return <PasswordSetupPage onComplete={handlePasswordSetup} onLogout={handleLogout} />;
  }

  const sessionContext = {
    logout: handleLogout,
    displayName,
  };

  logger.log("AppRouter: Authenticated and unlocked, route:", route.name);
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
    <AppSessionContext.Provider value={sessionContext}>{renderPage()}</AppSessionContext.Provider>
  );
}

function App() {
  console.log("DEBUG: App component rendered");
  logger.log("App component rendered");
  return (
    <AuthProvider>
      <TaskProvider>
        <RouterProvider>
          <AppRouter />
          <TaskBar />
        </RouterProvider>
      </TaskProvider>
    </AuthProvider>
  );
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

logger.log("About to render App component");
createRoot(renderer).render(<App />);
logger.log("App component rendered to root");
