import { useTerminalDimensions } from "@opentui/react";
import { THEME_COLORS } from "../lib/constants";
import { useTaskQueue } from "../lib/useTaskQueue";

interface Shortcut {
  key: string;
  description: string;
}

interface GuideBarProps {
  shortcuts: Shortcut[];
}

export function GuideBar({ shortcuts }: GuideBarProps) {
  const { width, height } = useTerminalDimensions();
  const { task } = useTaskQueue();

  const hasActiveTask = task.status !== "idle";
  const topPosition = hasActiveTask ? height - 2 : height - 1;

  return (
    <box
      position="absolute"
      left={0}
      top={topPosition}
      width={width}
      height={1}
      backgroundColor={THEME_COLORS.header}
      flexDirection="row"
      justifyContent="flex-start"
      paddingLeft={1}
      gap={2}
    >
      <text>
        {shortcuts.map((shortcut, index) => (
          <>
            <span fg={THEME_COLORS.primary}>{shortcut.key}</span>
            <span fg={THEME_COLORS.textMuted}> {shortcut.description}</span>
            {index < shortcuts.length - 1 && <span fg={THEME_COLORS.textDim}> │ </span>}
          </>
        ))}
      </text>
    </box>
  );
}
