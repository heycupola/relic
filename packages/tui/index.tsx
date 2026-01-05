import { initLogger } from "./utils/debugLog";

// Initialize logger first
await initLogger();

// Manual React DevTools connection
if (process.env.DEV === "true") {
  try {
    // We use import() to avoid bundling it in production if possible,
    // though this is an app, so peer deps are fine.
    // Specifying the specific path to avoid issues with some bundlers
    // but standard package import should work.
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
import { useEffect, useState } from "react";
import {
  HomePage,
  LoginPage,
  PasswordSetupPage,
  PasswordUnlockPage,
  ProjectPage,
} from "./components/pages";
import { TaskBar } from "./components/shared";
import { AuthProvider, useAuth } from "./convex";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { TaskProvider } from "./hooks/useTaskQueue";
import { RouterProvider, useRouter } from "./router";
import type { ProjectStatus } from "./types";
import { hasPassword, savePassword } from "./utils/passwordStorage";

function AppRouter() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { route, navigate, goBack } = useRouter();
  const { refreshAuth, logout } = useAuth();
  const { displayName } = useCurrentUser();

  // Track if password has been verified this session
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

  const handleLogout = async () => {
    await logout();
    setIsPasswordUnlocked(false);
    navigate({ name: "login" });
  };

  const handleSelectProject = (
    projectId: string,
    projectName: string,
    projectStatus: ProjectStatus,
  ) => {
    navigate({ name: "project", projectId, projectName, projectStatus });
  };

  const handleBackFromProject = () => {
    goBack();
  };

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
    } else {
      return <PasswordSetupPage onComplete={handlePasswordSetup} />;
    }
  }

  // Authenticated and password unlocked - normal routing
  switch (route.name) {
    case "login":
      // If already authenticated and unlocked, go to home
      navigate({ name: "home" });
      return null;
    case "password-setup":
    case "password-unlock":
      // Already unlocked, go to home
      navigate({ name: "home" });
      return null;
    case "home":
      return (
        <HomePage
          userName={displayName}
          onLogout={handleLogout}
          onSelectProject={handleSelectProject}
        />
      );
    case "project":
      return (
        <ProjectPage
          projectId={route.projectId}
          projectName={route.projectName}
          projectStatus={route.projectStatus}
          onBack={handleBackFromProject}
        />
      );
    default:
      return (
        <HomePage
          userName={displayName}
          onLogout={handleLogout}
          onSelectProject={handleSelectProject}
        />
      );
  }
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
