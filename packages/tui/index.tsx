import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { HomePage } from "./components/HomePage";
import { LoginPage } from "./components/LoginPage";
import { PasswordSetupPage } from "./components/PasswordSetupPage";
import { PasswordUnlockPage } from "./components/PasswordUnlockPage";
import { ProjectPage } from "./components/ProjectPage";
import { TaskBar } from "./components/TaskBar";
import { RouterProvider, useRouter } from "./lib/router";
import type { ProjectStatus } from "./lib/types";
import { TaskProvider } from "./lib/useTaskQueue";
import { hasPassword, savePassword } from "./lib/passwordStorage";
import { debugLog } from "./lib/debugLog";

function AppRouter() {
  const { route, navigate, goBack } = useRouter();

  const handleLogout = () => {
    // Logout goes to login page, not password unlock
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
    // After login, go to password unlock if password is set
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
      // Check if password is set and redirect accordingly
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
