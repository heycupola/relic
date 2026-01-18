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
import { useCallback, useEffect, useState } from "react";
import { TaskBar } from "./components/shared/TaskBar";
import { AppProvider, useAuth } from "./context";
import { AppSessionContext } from "./hooks/useAppSession";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { TaskProvider } from "./hooks/useTaskQueue";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PasswordSetupPage } from "./pages/PasswordSetupPage";
import { PasswordUnlockPage } from "./pages/PasswordUnlockPage";
import { ProjectPage } from "./pages/ProjectPage";
import { RouterProvider, useRouter } from "./router";
import { clearPassword, hasPassword, savePassword } from "./utils/password";

function AppRouter() {
  const { isAuthenticated, isLoading: isAuthLoading, refreshAuth, logout: authLogout } = useAuth();
  const { route, navigate } = useRouter();
  const { displayName } = useCurrentUser();

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
    return <LoginPage onLogin={handleLogin} />;
  }

  if (!isPasswordUnlocked) {
    if (passwordStatus.has) {
      return <PasswordUnlockPage onUnlock={handlePasswordUnlock} onLogout={handleLogout} />;
    }
    return <PasswordSetupPage onComplete={handlePasswordSetup} onLogout={handleLogout} />;
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
    <AppSessionContext.Provider value={sessionContext}>{renderPage()}</AppSessionContext.Provider>
  );
}

function App() {
  return (
    <AppProvider>
      <TaskProvider>
        <RouterProvider>
          <AppRouter />
          <TaskBar />
        </RouterProvider>
      </TaskProvider>
    </AppProvider>
  );
}

const renderer = await createCliRenderer({ exitOnCtrlC: true });
createRoot(renderer).render(<App />);
