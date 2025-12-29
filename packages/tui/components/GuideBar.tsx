import { useTerminalDimensions } from "@opentui/react";

interface Shortcut {
  key: string;
  description: string;
}

interface GuideBarProps {
  shortcuts: Shortcut[];
}

export function GuideBar({ shortcuts }: GuideBarProps) {
  const { width } = useTerminalDimensions();

  return (
    <box
      width={width}
      height={1}
      backgroundColor="#1a1b26"
      flexDirection="row"
      justifyContent="flex-start"
      paddingLeft={1}
      gap={2}
    >
      <text>
        {shortcuts.map((shortcut, index) => (
          <>
            <span fg="#7aa2f7">{shortcut.key}</span>
            <span fg="#565f89"> {shortcut.description}</span>
            {index < shortcuts.length - 1 && <span fg="#3b4261"> │ </span>}
          </>
        ))}
      </text>
    </box>
  );
}
