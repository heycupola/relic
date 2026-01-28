import {
  type DeviceAuthStatus,
  type DeviceCodeResponse,
  deviceAuth,
  validateSession,
} from "@repo/auth";
import { Box, render, Text } from "ink";
import Spinner from "ink-spinner";
import { useCallback, useEffect, useState } from "react";

interface LoginState {
  status: DeviceAuthStatus | "idle" | "starting" | "already_logged_in";
  userCode: string | null;
  verificationUri: string | null;
  error: Error | null;
}

function LoginFlow() {
  const [state, setState] = useState<LoginState>({
    status: "starting",
    userCode: null,
    verificationUri: null,
    error: null,
  });

  const startAuth = useCallback(async () => {
    const sessionValidation = await validateSession();
    if (sessionValidation.isValid && !sessionValidation.isExpired) {
      setState((prev) => ({ ...prev, status: "already_logged_in" }));
      return;
    }

    const result = await deviceAuth.startAuth({
      onCodeReceived: (code: DeviceCodeResponse) => {
        setState((prev) => ({
          ...prev,
          userCode: code.user_code,
          verificationUri: code.verification_uri_complete,
        }));
      },
      onStatusChange: (newStatus: DeviceAuthStatus) => {
        setState((prev) => ({
          ...prev,
          status: newStatus,
        }));
      },
      onSuccess: () => {
        setState((prev) => ({
          ...prev,
          status: "approved",
        }));
      },
      onError: (error: Error) => {
        setState((prev) => ({
          ...prev,
          status: "error",
          error,
        }));
      },
    });

    if (!result.success && result.error) {
      setState((prev) => ({ ...prev, error: result.error ?? null }));
    }
  }, []);

  useEffect(() => {
    startAuth();
    return () => {
      deviceAuth.stopPolling();
    };
  }, [startAuth]);

  useEffect(() => {
    if (state.status === "approved" || state.status === "already_logged_in") {
      setTimeout(() => process.exit(0), 1000);
    }
    if (state.status === "error" || state.status === "denied" || state.status === "expired") {
      setTimeout(() => process.exit(1), 500);
    }
  }, [state.status]);

  const formatCode = (code: string) => {
    if (code.includes("-")) return code;
    if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`;
    return code;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Relic Login</Text>
      <Text> </Text>

      {state.status === "starting" && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Connecting to server...</Text>
        </Box>
      )}

      {state.userCode && (
        <>
          <Text>Your verification code:</Text>
          <Box marginY={1}>
            <Text bold color="green">
              {formatCode(state.userCode)}
            </Text>
          </Box>
          {state.verificationUri && (
            <Text dimColor>Opening browser to: {state.verificationUri}</Text>
          )}
        </>
      )}

      <Text> </Text>

      {state.status === "pending" && state.userCode && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Waiting for authorization...</Text>
        </Box>
      )}

      {state.status === "approved" && <Text color="green">✓ Login successful!</Text>}

      {state.status === "already_logged_in" && <Text color="green">✓ Already logged in</Text>}

      {state.status === "denied" && <Text color="red">✗ Authorization denied</Text>}

      {state.status === "expired" && <Text color="red">✗ Code expired. Please try again.</Text>}

      {state.error && <Text color="red">Error: {state.error.message}</Text>}
    </Box>
  );
}

export function login() {
  render(<LoginFlow />);
}

export default login;
