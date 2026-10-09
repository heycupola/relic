/** @jsxImportSource @opentui/react */
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { type TaskStatus, useTaskQueue } from "../../hooks/useTaskQueue";
import { SPINNER_FRAMES, SPINNER_INTERVAL, THEME_COLORS } from "../../utils/constants";
import { truncate } from "../../utils/ui";

// NOTE: Background colors create visual hierarchy:
// - Idle: darker - blends in, passive status bar
// - Running/Pending: elevated - "something is happening"
// - Success/Error: colored backgrounds - demands attention
const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; textColor: string; bgColor: string; prefix: string }
> = {
  idle: { icon: "", textColor: THEME_COLORS.textDim, bgColor: THEME_COLORS.statusBar, prefix: "" },
  pending: {
    icon: "…",
    textColor: THEME_COLORS.warning,
    bgColor: THEME_COLORS.statusBarActive,
    prefix: "",
  },
  running: {
    icon: "",
    textColor: THEME_COLORS.primary,
    bgColor: THEME_COLORS.statusBarActive,
    prefix: "",
  },
  success: {
    icon: "✓",
    textColor: THEME_COLORS.textInverse,
    bgColor: THEME_COLORS.success,
    prefix: "Success: ",
  },
  error: {
    icon: "✗",
    textColor: THEME_COLORS.textInverse,
    bgColor: THEME_COLORS.error,
    prefix: "Error: ",
  },
};

interface TaskBarProps {
  userEmail?: string;
  hasPro?: boolean;
}

export function TaskBar({ userEmail, hasPro }: TaskBarProps) {
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

  const version = process.env._RELIC_VERSION;
  const planLabel = hasPro ? "Pro" : "Free";
  const separatorColor = isResult ? config.textColor : THEME_COLORS.textDim;
  const userTextColor = isResult ? config.textColor : THEME_COLORS.textMuted;

  // NOTE: The message is truncated so it never runs into the account info on the right.
  const innerWidth = Math.max(0, width - 2);
  const maxEmailLength = Math.max(8, Math.floor(innerWidth / 3));
  const email = userEmail ? truncate(userEmail, maxEmailLength) : "";
  const rightText = [email && `${email} · ${planLabel}`, version && `v${version}`]
    .filter(Boolean)
    .join(" · ");
  const messageRoom = Math.max(0, innerWidth - rightText.length - 2);
  const leadLength = isResult ? `${icon} ${config.prefix}`.length : `${icon} `.length;
  const message = truncate(task.message, Math.max(0, messageRoom - leadLength));

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
            <span fg={config.textColor}>{message}</span>
          </>
        ) : (
          <>
            <span fg={config.textColor}>{icon}</span>
            <span fg={THEME_COLORS.text}> {message}</span>
          </>
        )}
      </text>
      <text>
        {email && (
          <>
            <span fg={userTextColor}>{email}</span>
            <span fg={separatorColor}> · </span>
            <span
              fg={
                isResult ? config.textColor : hasPro ? THEME_COLORS.success : THEME_COLORS.textMuted
              }
            >
              {planLabel}
            </span>
          </>
        )}
        {version && (
          <>
            {email && <span fg={separatorColor}> · </span>}
            <span fg={isResult ? config.textColor : THEME_COLORS.textMuted}>v{version}</span>
          </>
        )}
      </text>
    </box>
  );
}
