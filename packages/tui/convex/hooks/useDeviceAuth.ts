import { useCallback, useEffect, useRef, useState } from "react";
import { debugLog } from "../../utils";
import type { DeviceCodeResponse } from "../api";
import { type DeviceAuthStatus, deviceAuth } from "../services/deviceAuth";

interface UseDeviceAuthOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface UseDeviceAuthReturn {
  status: DeviceAuthStatus | "idle";
  userCode: string | null;
  verificationUri: string | null;
  isLoading: boolean;
  error: Error | null;
  startAuth: () => Promise<void>;
  cancel: () => void;
}

export function useDeviceAuth(options?: UseDeviceAuthOptions): UseDeviceAuthReturn {
  const [status, setStatus] = useState<DeviceAuthStatus | "idle">("idle");
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      deviceAuth.stopPolling();
    };
  }, []);

  const startAuth = useCallback(async () => {
    if (!isMounted.current) return;

    setIsLoading(true);
    setError(null);
    setStatus("pending");

    const result = await deviceAuth.startAuth({
      onCodeReceived: (code: DeviceCodeResponse) => {
        if (!isMounted.current) return;
        setUserCode(code.user_code);
        setVerificationUri(code.verification_uri_complete);
      },
      onStatusChange: (newStatus: DeviceAuthStatus) => {
        if (!isMounted.current) return;
        setStatus(newStatus);
      },
      onSuccess: () => {
        if (!isMounted.current) return;
        setIsLoading(false);
        options?.onSuccess?.();
      },
      onError: (err: Error) => {
        if (!isMounted.current) return;
        setError(err);
        setIsLoading(false);
        options?.onError?.(err);
      },
    });

    if (!result.success && result.error) {
      setError(result.error);
    }

    setIsLoading(false);
  }, [options]);

  const cancel = useCallback(() => {
    deviceAuth.stopPolling();
    setStatus("idle");
    setIsLoading(false);
    setUserCode(null);
    setVerificationUri(null);
  }, []);

  return {
    status,
    userCode,
    verificationUri,
    isLoading,
    error,
    startAuth,
    cancel,
  };
}
