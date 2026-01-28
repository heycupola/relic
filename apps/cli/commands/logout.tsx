import { clearSession, validateSession } from "@repo/auth";
import { Box, render, Text } from "ink";
import { useEffect, useState } from "react";

type LogoutStatus = "checking" | "logging_out" | "success" | "not_logged_in" | "error";

function LogoutFlow() {
  const [status, setStatus] = useState<LogoutStatus>("checking");
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const performLogout = async () => {
      const session = await validateSession();

      if (!session.isValid) {
        setStatus("not_logged_in");
        return;
      }

      setStatus("logging_out");

      try {
        await clearSession();
        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to logout"));
        setStatus("error");
      }
    };

    performLogout();
  }, []);

  useEffect(() => {
    if (status === "success" || status === "not_logged_in") {
      setTimeout(() => process.exit(0), 500);
    }
    if (status === "error") {
      setTimeout(() => process.exit(1), 500);
    }
  }, [status]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Relic Logout</Text>
      <Text> </Text>

      {status === "checking" && <Text dimColor>Checking session...</Text>}

      {status === "logging_out" && <Text dimColor>Logging out...</Text>}

      {status === "success" && <Text color="green">✓ Logged out</Text>}

      {status === "not_logged_in" && <Text color="yellow">Not logged in</Text>}

      {status === "error" && error && <Text color="red">Error: {error.message}</Text>}
    </Box>
  );
}

export function logout() {
  render(<LogoutFlow />);
}

export default logout;
