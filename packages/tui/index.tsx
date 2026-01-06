import { initLogger } from "./utils/debugLog";

// Initialize logger first
await initLogger();

// Manual React DevTools connection
if (process.env.DEV === "true") {
  try {
    const devtools = await import("react-devtools-core");
    devtools.connectToDevTools({
      host: "localhost",
      port: 8097,
    });
    console.log("Attempted to connect to React DevTools");
  } catch (err) {
    console.error("Failed to connect to React DevTools", err);
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
import {
  HomePage,
  LoginPage,
  PasswordSetupPage,
  PasswordUnlockPage,
  ProjectPage,
} from "./pages";
import { RouterProvider, useRouter } from "./router";
import { hasPassword, savePassword } from "./utils/passwordStorage";

function AppRouter() {
  const { isAuthenticated, isLoading: isAuthLoading, refreshAuth, logout: authLogout } = useAuth();
  const { route, navigate } = useRouter();
  const { displayName } = useCurrentUser();

  // Password session state
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

  // Session logout handler - used by pages via useAppSession hook
  const handleLogout = useCallback(async () => {
    await authLogout();
    setIsPasswordUnlocked(false);
    navigate({ name: "login" });
  }, [authLogout, navigate]);

  // Password flow handlers
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
    if (has) {
      navigate({ name: "password-unlock" });
    } else {
      navigate({ name: "password-setup" });
    }
  };

  // Show loading while checking auth or password status
  if (isAuthLoading || passwordStatus.loading) {
    return null;
  }

  // Not authenticated - show login page
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Authenticated but password not yet unlocked
  if (!isPasswordUnlocked) {
    if (passwordStatus.has) {
      return <PasswordUnlockPage onUnlock={handlePasswordUnlock} />;
    }
    return <PasswordSetupPage onComplete={handlePasswordSetup} />;
  }

  // Provide session context for pages
  const sessionContext = {
    logout: handleLogout,
    displayName,
  };

  // Authenticated and password unlocked - normal routing
  const renderPage = () => {
    switch (route.name) {
      case "login":
      case "password-setup":
      case "password-unlock":
        // Already authenticated and unlocked, redirect to home
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
      case "home":
      default:
        return <HomePage />;
    }
  };

  return (
    <AppSessionContext.Provider value={sessionContext}>
      {renderPage()}
    </AppSessionContext.Provider>
  );
}

function App() {
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

createRoot(renderer).render(<App />);
