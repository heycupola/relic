import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { type TaskStatus, useTaskQueue } from "../../hooks/useTaskQueue";
import { THEME_COLORS } from "../../utils/constants";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL = 80;

const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; textColor: string; bgColor: string; prefix: string }
> = {
  idle: { icon: "", textColor: THEME_COLORS.textDim, bgColor: "#24283b", prefix: "" },
  pending: { icon: "…", textColor: THEME_COLORS.accent, bgColor: "#24283b", prefix: "" },
  running: { icon: "", textColor: THEME_COLORS.primary, bgColor: "#24283b", prefix: "" },
  success: { icon: "✓", textColor: "#1a1e2e", bgColor: "#9ece6a", prefix: "Success: " },
  error: { icon: "✗", textColor: "#1a1e2e", bgColor: "#f7768e", prefix: "Error: " },
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
  const isResult = task.status === "success" || task.status === "error";

  return (
    <box
      position="absolute"
      left={0}
      top={height - 1}
      width={width}
      height={1}
      backgroundColor={isResult ? config.bgColor : "#24283b"}
      flexDirection="row"
      justifyContent="flex-start"
      paddingLeft={1}
    >
      <text>
        {isResult ? (
          <>
            <b>
              <span fg={config.textColor}>
                {icon} {config.prefix}
              </span>
            </b>
            <span fg={config.textColor}>{task.message}</span>
          </>
        ) : (
          <>
            <span fg={config.textColor}>{icon}</span>
            <span fg={THEME_COLORS.textMuted}> {task.message}</span>
          </>
        )}
      </text>
    </box>
  );
}
