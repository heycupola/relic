/** @jsxImportSource @opentui/react */
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { extractErrorMessage } from "@repo/auth";
import { createLogger } from "@repo/logger";
import { Component, type ReactNode } from "react";
import { THEME_COLORS } from "../../utils/constants";
import { GuideBar } from "./GuideBar";

const logger = createLogger("tui");

interface ErrorBoundaryProps {
  children: ReactNode;
  onRecover: () => void;
  onQuit: () => void;
}

interface ErrorBoundaryState {
  error: unknown;
}

const NO_ERROR: ErrorBoundaryState = { error: null };

/** Catches render errors (e.g. a Convex query rejecting access) and offers a way home. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state = NO_ERROR;

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error ?? new Error("Unknown error") };
  }

  override componentDidCatch(error: unknown) {
    logger.error("Render error caught by boundary:", error);
  }

  private recover = () => {
    this.setState(NO_ERROR);
    this.props.onRecover();
  };

  override render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          message={toFriendlyMessage(this.state.error)}
          onRecover={this.recover}
          onQuit={this.props.onQuit}
        />
      );
    }
    return this.props.children;
  }
}

function toFriendlyMessage(error: unknown): string {
  const message = extractErrorMessage(error);
  if (/restricted|archived|access|not found|unauthori[sz]ed|permission/i.test(message)) {
    return `You no longer have access to this project. ${message}`;
  }
  return message;
}

function ErrorScreen({
  message,
  onRecover,
  onQuit,
}: {
  message: string;
  onRecover: () => void;
  onQuit: () => void;
}) {
  const { width, height } = useTerminalDimensions();
  const boxWidth = Math.min(60, Math.max(20, width - 4));

  useKeyboard((key) => {
    if (key.name === "return" || key.name === "escape" || key.name === "h") onRecover();
    else if (key.name === "q") onQuit();
  });

  return (
    <box
      width={width}
      height={height - 1}
      justifyContent="center"
      alignItems="center"
      backgroundColor={THEME_COLORS.background}
    >
      <box
        flexDirection="column"
        width={boxWidth}
        backgroundColor={THEME_COLORS.header}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
      >
        <text fg={THEME_COLORS.error}>
          <strong>Something went wrong</strong>
        </text>
        <box marginTop={1}>
          <text fg={THEME_COLORS.textMuted}>{message}</text>
        </box>
        <box marginTop={1}>
          <GuideBar
            shortcuts={[
              { key: "↵", description: "go home" },
              { key: "q", description: "quit" },
            ]}
            customWidth={boxWidth - 4}
          />
        </box>
      </box>
    </box>
  );
}
