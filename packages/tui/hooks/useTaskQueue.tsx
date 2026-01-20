import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { extractErrorMessage } from "../convex/types";

export type TaskStatus = "idle" | "pending" | "running" | "success" | "error";

interface TaskState {
  status: TaskStatus;
  message: string;
}

interface TaskContextValue {
  task: TaskState;
  isProcessing: boolean;
  isRunning: boolean;
  isPending: boolean;
  runTask: <T>(message: string, taskFn: () => Promise<T>) => Promise<T | undefined>;
  setTaskPending: (message: string) => void;
  continueTask: <T>(taskFn: () => Promise<T>) => Promise<T | undefined>;
  cancelTask: () => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string) => void;
}

const TaskContext = createContext<TaskContextValue | null>(null);

const SUCCESS_HIDE_DELAY = 3000;
const ERROR_HIDE_DELAY = 4000;

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
    async <T,>(message: string, taskFn: () => Promise<T>): Promise<T | undefined> => {
      clearHideTimeout();
      setTask({ status: "running", message });

      try {
        const result = await taskFn();
        setTask({ status: "success", message });
        hideAfterDelay(SUCCESS_HIDE_DELAY);
        return result;
      } catch (error) {
        const errorMessage = extractErrorMessage(error);
        setTask({ status: "error", message: errorMessage });
        hideAfterDelay(ERROR_HIDE_DELAY);
        return undefined;
      }
    },
    [clearHideTimeout, hideAfterDelay],
  );

  const setTaskPending = useCallback(
    (message: string) => {
      clearHideTimeout();
      setTask({ status: "pending", message });
    },
    [clearHideTimeout],
  );

  const continueTask = useCallback(
    async <T,>(taskFn: () => Promise<T>): Promise<T | undefined> => {
      const currentMessage = task.message;
      setTask({ status: "running", message: currentMessage });

      try {
        const result = await taskFn();
        setTask({ status: "success", message: currentMessage });
        hideAfterDelay(SUCCESS_HIDE_DELAY);
        return result;
      } catch (error) {
        const errorMessage = extractErrorMessage(error);
        setTask({ status: "error", message: errorMessage });
        hideAfterDelay(ERROR_HIDE_DELAY);
        return undefined;
      }
    },
    [task.message, hideAfterDelay],
  );

  const cancelTask = useCallback(() => {
    clearHideTimeout();
    setTask({ status: "idle", message: "" });
  }, [clearHideTimeout]);

  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      clearHideTimeout();
      setTask({ status: "success", message });
      hideAfterDelay(duration ?? SUCCESS_HIDE_DELAY);
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

  const isRunning = task.status === "running";
  const isPending = task.status === "pending";
  const isProcessing = isRunning || isPending;

  return (
    <TaskContext.Provider
      value={{
        task,
        isProcessing,
        isRunning,
        isPending,
        runTask,
        setTaskPending,
        continueTask,
        cancelTask,
        showSuccess,
        showError,
      }}
    >
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
