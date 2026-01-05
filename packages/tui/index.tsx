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
import { TaskProvider } from "./hooks/useTaskQueue";
import { RouterProvider, useRouter } from "./router";
import type { ProjectStatus } from "./types";
import { hasPassword, savePassword } from "./utils/passwordStorage";

function AppRouter() {
  const { route, navigate, goBack } = useRouter();
  const { refreshAuth } = useAuth();
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

  const handleLogout = () => {
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
    navigate({ name: "home" });
  };

  const handlePasswordUnlock = () => {
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

  if (passwordStatus.loading) {
    return null; // Or a loading spinner if preferred, but null is fine for CLI flash
  }

  switch (route.name) {
    case "login":
      return <LoginPage onLogin={handleLogin} />;
    case "password-setup":
      return <PasswordSetupPage onComplete={handlePasswordSetup} />;
    case "password-unlock":
      return <PasswordUnlockPage onUnlock={handlePasswordUnlock} />;
    case "home":
      return (
        <HomePage
          userName="icanvardar"
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
      if (passwordStatus.has) {
        return <PasswordUnlockPage onUnlock={handlePasswordUnlock} />;
      } else {
        return <PasswordSetupPage onComplete={handlePasswordSetup} />;
      }
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
