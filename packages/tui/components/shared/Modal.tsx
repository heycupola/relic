import { useTerminalDimensions } from "@opentui/react";
import { Fragment, type ReactNode } from "react";
import type { Shortcut } from "../../types/keyboard";
import { THEME_COLORS } from "../../utils/constants";

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
      {/* Leave bottom row for TaskBar */}
      <box
        position="absolute"
        left={0}
        top={0}
        width={termWidth}
        height={termHeight - 1}
        backgroundColor={THEME_COLORS.background}
      />

      <box
        position="absolute"
        left={left}
        top={top}
        width={width}
        flexDirection="column"
        backgroundColor={THEME_COLORS.header}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        {title && (
          <box height={1} width={width - 4} justifyContent="flex-start" marginBottom={1}>
            <text fg={THEME_COLORS.text}>
              <strong>{title}</strong>
            </text>
          </box>
        )}

        <box flexDirection="column">{children}</box>

        {shortcuts && (
          <box height={1} justifyContent="flex-start" marginTop={1}>
            <text>
              {shortcuts.map((shortcut, index) => (
                <Fragment key={shortcut.key}>
                  {index > 0 && <span fg={THEME_COLORS.textDim}> </span>}
                  <span fg={THEME_COLORS.textDim}>[</span>
                  <span fg={shortcut.disabled ? THEME_COLORS.textMuted : THEME_COLORS.primary}>
                    {shortcut.key}
                  </span>
                  <span fg={THEME_COLORS.textDim}>]</span>
                  <span fg={THEME_COLORS.textMuted}> {shortcut.description}</span>
                </Fragment>
              ))}
            </text>
          </box>
        )}
      </box>
    </>
  );
}
