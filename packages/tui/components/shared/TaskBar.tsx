import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { type TaskStatus, useTaskQueue } from "../../hooks/useTaskQueue";
import { THEME_COLORS } from "../../utils/constants";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL = 80;

const STATUS_CONFIG: Record<TaskStatus, { icon: string; color: string }> = {
  idle: { icon: "", color: THEME_COLORS.textDim },
  running: { icon: "", color: THEME_COLORS.primary },
  success: { icon: "✓", color: THEME_COLORS.success },
  error: { icon: "✗", color: THEME_COLORS.error },
};

export function TaskBar() {
  const { width, height } = useTerminalDimensions();
  const { task } = useTaskQueue();
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    if (task.status !== "running") return;

    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL);

    return () => clearInterval(interval);
  }, [task.status]);

  if (task.status === "idle") {
    return null;
  }

  const config = STATUS_CONFIG[task.status];
  const icon = task.status === "running" ? SPINNER_FRAMES[spinnerFrame] : config.icon;

  return (
    <box
      position="absolute"
      left={0}
      top={height - 1}
      width={width}
      height={1}
      backgroundColor="#24283b"
      flexDirection="row"
      justifyContent="flex-start"
      paddingLeft={1}
    >
      <text>
        <span fg={config.color}>{icon}</span>
        <span fg={THEME_COLORS.textMuted}> {task.message}</span>
      </text>
    </box>
  );
}
