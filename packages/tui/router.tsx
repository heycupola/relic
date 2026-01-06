import { createContext, type ReactNode, useContext, useState } from "react";
import type { ProjectStatus } from "./types";

export type Route =
  | { name: "login" }
  | { name: "password-setup" }
  | { name: "password-unlock" }
  | { name: "home" }
  | {
      name: "project";
      projectId: string;
      projectName: string;
      projectStatus: ProjectStatus;
    };

interface RouterContextType {
  route: Route;
  navigate: (route: Route) => void;
  goBack: () => void;
}

const RouterContext = createContext<RouterContextType | null>(null);

export function useRouter() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error("useRouter must be used within RouterProvider");
  }
  return context;
}

interface RouterProviderProps {
  children: ReactNode;
  initialRoute?: Route;
}

export function RouterProvider({
  children,
  initialRoute = { name: "login" },
}: RouterProviderProps) {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [history, setHistory] = useState<Route[]>([]);

  const navigate = (newRoute: Route) => {
    setHistory((prev) => [...prev, route]);
    setRoute(newRoute);
  };

  const goBack = () => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory((h) => h.slice(0, -1));
      setRoute(prev);
    }
  };

  return (
    <RouterContext.Provider value={{ route, navigate, goBack }}>{children}</RouterContext.Provider>
  );
}
