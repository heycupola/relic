/** @jsxImportSource @opentui/react */
import { useTerminalDimensions } from "@opentui/react";
import type { ReactNode } from "react";
import type { Shortcut } from "../../types/keyboard";
import { THEME_COLORS } from "../../utils/constants";
import { GuideBar } from "./GuideBar";

interface ModalProps {
  visible: boolean;
  title?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  shortcuts?: Shortcut[];
  width?: number;
  /** Minimum height; the modal grows with its content up to the terminal height. */
  height?: number;
}

export function Modal({
  visible,
  title,
  headerRight,
  children,
  shortcuts,
  width = 50,
  height,
}: ModalProps) {
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  if (!visible) {
    return null;
  }

  // NOTE: The bottom row is reserved for the TaskBar.
  const availableHeight = Math.max(1, termHeight - 1);
  const modalWidth = Math.max(10, Math.min(width, termWidth));
  const minHeight = height ? Math.min(height, availableHeight) : undefined;
  const innerWidth = modalWidth - 4;

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={termWidth}
      height={availableHeight}
      backgroundColor={THEME_COLORS.background}
      justifyContent="center"
      alignItems="center"
    >
      <box
        width={modalWidth}
        minHeight={minHeight}
        maxHeight={availableHeight}
        flexShrink={1}
        overflow="hidden"
        flexDirection="column"
        backgroundColor={THEME_COLORS.header}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        {(title || headerRight) && (
          <box
            height={1}
            width={innerWidth}
            flexDirection="row"
            justifyContent="space-between"
            marginBottom={1}
          >
            <text fg={THEME_COLORS.text}>
              <strong>{title}</strong>
            </text>
            {headerRight}
          </box>
        )}

        <box flexDirection="column" flexGrow={1}>
          {children}
        </box>

        {shortcuts && shortcuts.length > 0 && (
          <box marginTop={1}>
            <GuideBar shortcuts={shortcuts} customWidth={innerWidth} />
          </box>
        )}
      </box>
    </box>
  );
}
