/** @jsxImportSource @opentui/react */
import { extractErrorMessage } from "@repo/auth";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

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
  attemptTask: (message: string, taskFn: () => Promise<unknown>) => Promise<boolean>;
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
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const hideAfterDelay = useCallback(
    (delay: number) => {
      clearHideTimeout();
      hideTimeoutRef.current = setTimeout(() => {
        hideTimeoutRef.current = null;
        setTask({ status: "idle", message: "" });
      }, delay);
    },
    [clearHideTimeout],
  );

  useEffect(() => clearHideTimeout, [clearHideTimeout]);

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

  const attemptTask = useCallback(
    async (message: string, taskFn: () => Promise<unknown>): Promise<boolean> => {
      const result = await runTask(message, async () => {
        await taskFn();
        return true;
      });
      return result === true;
    },
    [runTask],
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
      clearHideTimeout();
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
    [task.message, clearHideTimeout, hideAfterDelay],
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
        attemptTask,
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
