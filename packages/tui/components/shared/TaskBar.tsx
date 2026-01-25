import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { type TaskStatus, useTaskQueue } from "../../hooks/useTaskQueue";
import { SPINNER_FRAMES, SPINNER_INTERVAL, THEME_COLORS } from "../../utils/constants";

// NOTE: Background colors create visual hierarchy:
// - Idle: darker (#1a1e2e) - blends in, passive status bar
// - Running/Pending: elevated (#24283b) - "something is happening"
// - Success/Error: colored backgrounds - demands attention
const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; textColor: string; bgColor: string; prefix: string }
> = {
  idle: { icon: "", textColor: THEME_COLORS.textDim, bgColor: "#1a1e2e", prefix: "" },
  pending: { icon: "…", textColor: THEME_COLORS.accent, bgColor: "#24283b", prefix: "" },
  running: { icon: "", textColor: THEME_COLORS.primary, bgColor: "#24283b", prefix: "" },
  success: { icon: "✓", textColor: "#1a1e2e", bgColor: "#9ece6a", prefix: "Success: " },
  error: { icon: "✗", textColor: "#1a1e2e", bgColor: "#f7768e", prefix: "Error: " },
};

interface TaskBarProps {
  userEmail?: string;
}

export function TaskBar({ userEmail }: TaskBarProps) {
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

  const config = STATUS_CONFIG[task.status];
  const icon = task.status === "running" ? SPINNER_FRAMES[spinnerFrame] : config.icon;
  const isResult = task.status === "success" || task.status === "error";
  const isIdle = task.status === "idle";

  // NOTE: User email color adapts to background for readability.
  // Using textMuted (brighter) instead of textDim for better visibility in idle state.
  const userTextColor = isResult ? config.textColor : THEME_COLORS.textMuted;

  return (
    <box
      position="absolute"
      left={0}
      top={height - 1}
      width={width}
      height={1}
      backgroundColor={config.bgColor}
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        {isIdle ? (
          ""
        ) : isResult ? (
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
      {userEmail && <text fg={userTextColor}>{userEmail}</text>}
    </box>
  );
}
