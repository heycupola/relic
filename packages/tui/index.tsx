import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import {
  HomePage,
  LoginPage,
  PasswordSetupPage,
  PasswordUnlockPage,
  ProjectPage,
} from "./components/pages";
import { TaskBar } from "./components/shared";
import { TaskProvider } from "./hooks/useTaskQueue";
import { RouterProvider, useRouter } from "./router";
import type { ProjectStatus } from "./types";
import { debugLog } from "./utils/debugLog";
import { hasPassword, savePassword } from "./utils/passwordStorage";

function AppRouter() {
  const { route, navigate, goBack } = useRouter();

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

  const handlePasswordSetup = (password: string) => {
    debugLog("handlePasswordSetup called with password:", password);
    savePassword(password);
    debugLog("Password saved, navigating to home");
    navigate({ name: "home" });
    debugLog("navigate called");
  };

  const handlePasswordUnlock = () => {
    navigate({ name: "home" });
  };

  const handleLogin = () => {
    if (hasPassword()) {
      navigate({ name: "password-unlock" });
    } else {
      navigate({ name: "password-setup" });
    }
  };

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
      if (hasPassword()) {
        return <PasswordUnlockPage onUnlock={handlePasswordUnlock} />;
      } else {
        return <PasswordSetupPage onComplete={handlePasswordSetup} />;
      }
  }
}

function App() {
  return (
    <TaskProvider>
      <RouterProvider>
        <AppRouter />
        <TaskBar />
      </RouterProvider>
    </TaskProvider>
  );
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

createRoot(renderer).render(<App />);
