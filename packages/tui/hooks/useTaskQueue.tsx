import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { extractErrorMessage } from "../convex/types";

export type TaskStatus = "idle" | "running" | "success" | "error";

interface TaskState {
  status: TaskStatus;
  message: string;
}

interface TaskContextValue {
  task: TaskState;
  runTask: (message: string, taskFn: () => Promise<void>) => Promise<void>;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const TaskContext = createContext<TaskContextValue | null>(null);

const SUCCESS_HIDE_DELAY = 3000; // 3 seconds for success messages
const ERROR_HIDE_DELAY = 4000; // 4 seconds for error messages (longer for readability)

export function TaskProvider({ children }: { children: ReactNode }) {
  const [task, setTask] = useState<TaskState>({ status: "idle", message: "" });
  const [hideTimeout, setHideTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      setHideTimeout(null);
    }
  }, [hideTimeout]);

  const hideAfterDelay = useCallback((delay: number) => {
    const timeout = setTimeout(() => {
      setTask({ status: "idle", message: "" });
    }, delay);
    setHideTimeout(timeout);
  }, []);

  const runTask = useCallback(
    async (message: string, taskFn: () => Promise<void>) => {
      clearHideTimeout();
      setTask({ status: "running", message });

      try {
        await taskFn();
        setTask({ status: "success", message });
        hideAfterDelay(SUCCESS_HIDE_DELAY);
      } catch (error) {
        const errorMessage = extractErrorMessage(error);
        setTask({ status: "error", message: errorMessage });
        hideAfterDelay(ERROR_HIDE_DELAY);
        // Re-throw error so caller can handle it
        throw error;
      }
    },
    [clearHideTimeout, hideAfterDelay],
  );

  const showSuccess = useCallback(
    (message: string) => {
      clearHideTimeout();
      setTask({ status: "success", message });
      hideAfterDelay(SUCCESS_HIDE_DELAY);
    },
    [clearHideTimeout, hideAfterDelay],
  );

  const showError = useCallback(
    (message: string) => {
      clearHideTimeout();
      setTask({ status: "error", message });
      hideAfterDelay(ERROR_HIDE_DELAY);
    },
    [clearHideTimeout, hideAfterDelay],
  );

  return (
    <TaskContext.Provider value={{ task, runTask, showSuccess, showError }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTaskQueue() {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTaskQueue must be used within a TaskProvider");
  }
  return context;
}
