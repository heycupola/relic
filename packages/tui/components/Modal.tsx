import { useTerminalDimensions } from "@opentui/react";
import type { ReactNode } from "react";
import { THEME_COLORS } from "../lib/constants";

interface Shortcut {
  key: string;
  description: string;
}

interface ModalProps {
  visible: boolean;
  title?: string;
  children: ReactNode;
  shortcuts?: Shortcut[];
  width?: number;
  height?: number;
}

export function Modal({
  visible,
  title,
  children,
  shortcuts,
  width = 50,
  height = 15,
}: ModalProps) {
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  if (!visible) {
    return null;
  }

  const left = Math.floor((termWidth - width) / 2);
  const top = Math.floor((termHeight - height) / 2);

  return (
    <>
      {/* Background overlay */}
      <box
        position="absolute"
        left={0}
        top={0}
        width={termWidth}
        height={termHeight}
        backgroundColor={THEME_COLORS.background}
      />
      {/* Modal card */}
      <box
        position="absolute"
        left={left}
        top={top}
        width={width}
        height={height}
        flexDirection="column"
        backgroundColor={THEME_COLORS.header}
        paddingLeft={2}
        paddingRight={2}
        paddingBottom={1}
      >
        {/* Title */}
        {title && (
          <box height={3} justifyContent="center" alignItems="center">
            <text fg={THEME_COLORS.text}>
              <strong>{title}</strong>
            </text>
          </box>
        )}
        {/* Content */}
        <box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
          {children}
        </box>
      </box>
      {/* Shortcuts - directly below modal card */}
      {shortcuts && (
        <box
          position="absolute"
          left={left}
          top={top + height}
          width={width}
          height={1}
          justifyContent="center"
          alignItems="center"
        >
          <text>
            {shortcuts.map((shortcut, index) => (
              <>
                <span fg={THEME_COLORS.primary}>{shortcut.key}</span>
                <span fg={THEME_COLORS.textMuted}> {shortcut.description}</span>
                {index < shortcuts.length - 1 && <span fg={THEME_COLORS.textDim}> </span>}
              </>
            ))}
          </text>
        </box>
      )}
    </>
  );
}
