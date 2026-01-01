import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { HomePage } from "./components/HomePage";
import { LoginPage } from "./components/LoginPage";
import { ProjectPage } from "./components/ProjectPage";
import { TaskBar } from "./components/TaskBar";
import { RouterProvider, useRouter } from "./lib/router";
import type { ProjectStatus } from "./lib/types";
import { TaskProvider } from "./lib/useTaskQueue";

function AppRouter() {
  const { route, navigate, goBack } = useRouter();

  const handleLogin = () => {
    navigate({ name: "home" });
  };

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

  switch (route.name) {
    case "login":
      return <LoginPage onLogin={handleLogin} />;
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
      return <LoginPage onLogin={handleLogin} />;
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
