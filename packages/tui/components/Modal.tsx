import { useTerminalDimensions } from "@opentui/react";
import type { ReactNode } from "react";

interface ModalProps {
  visible: boolean;
  title?: string;
  children: ReactNode;
  width?: number;
  height?: number;
}

export function Modal({ visible, title, children, width = 50, height = 15 }: ModalProps) {
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  if (!visible) {
    return null;
  }

  const left = Math.floor((termWidth - width) / 2);
  const top = Math.floor((termHeight - height) / 2);

  return (
    <>
      <box
        position="absolute"
        left={0}
        top={0}
        width={termWidth}
        height={termHeight - 1}
        backgroundColor="#0f0f14"
      />
      <box
        position="absolute"
        left={left}
        top={top}
        width={width}
        height={height}
        flexDirection="column"
        borderStyle="double"
        borderColor="#7aa2f7"
        backgroundColor="#1a1b26"
      >
        {title && (
          <box
            height={3}
            width={width - 2}
            justifyContent="center"
            alignItems="center"
            backgroundColor="#292e42"
          >
            <text fg="#c0caf5">
              <strong>{title}</strong>
            </text>
          </box>
        )}
        <box
          flexDirection="column"
          flexGrow={1}
          padding={1}
          alignItems="center"
          justifyContent="center"
        >
          {children}
        </box>
      </box>
    </>
  );
}
