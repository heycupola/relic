import { validateSession } from "@repo/auth";
import { Box, render, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import { getApi, type User } from "../lib/api";

type WhoamiStatus = "loading" | "success" | "not_logged_in" | "error";

interface WhoamiState {
  status: WhoamiStatus;
  user: User | null;
  error: string | null;
}

function WhoamiFlow() {
  const [state, setState] = useState<WhoamiState>({
    status: "loading",
    user: null,
    error: null,
  });

  useEffect(() => {
    async function fetchUser() {
      try {
        const sessionValidation = await validateSession();
        if (!sessionValidation.isValid || sessionValidation.isExpired) {
          setState({ status: "not_logged_in", user: null, error: null });
          return;
        }

        const api = getApi();
        const user = await api.getCurrentUser();
        setState({ status: "success", user, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch user";
        setState({ status: "error", user: null, error: message });
      }
    }

    fetchUser();
  }, []);

  useEffect(() => {
    if (state.status === "success" || state.status === "not_logged_in") {
      setTimeout(() => process.exit(0), 100);
    }
    if (state.status === "error") {
      setTimeout(() => process.exit(1), 100);
    }
  }, [state.status]);

  return (
    <Box flexDirection="column" padding={1}>
      {state.status === "loading" && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Fetching user info...</Text>
        </Box>
      )}

      {state.status === "not_logged_in" && (
        <Box flexDirection="column">
          <Text color="yellow">Not logged in</Text>
          <Text dimColor>Run `relic login` to authenticate</Text>
        </Box>
      )}

      {state.status === "success" && state.user && (
        <Box flexDirection="column">
          <Text bold>Logged in as:</Text>
          <Text> </Text>
          <Box>
            <Text dimColor>Name: </Text>
            <Text>{state.user.name}</Text>
          </Box>
          <Box>
            <Text dimColor>Email: </Text>
            <Text>{state.user.email}</Text>
          </Box>
          <Box>
            <Text dimColor>Plan: </Text>
            <Text color={state.user.hasPro ? "green" : undefined}>
              {state.user.hasPro ? "Pro" : "Free"}
            </Text>
          </Box>
        </Box>
      )}

      {state.status === "error" && (
        <Box flexDirection="column">
          <Text color="red">Error: {state.error}</Text>
        </Box>
      )}
    </Box>
  );
}

export function whoami() {
  render(<WhoamiFlow />);
}

export default whoami;
