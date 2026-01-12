import open from "open";
import type { DeviceCodeResponse, DeviceTokenResponse } from "../api";
import { publicApi } from "../api";
import { isAuthorizationDenied, isAuthorizationPending, isDeviceCodeExpired } from "../types";
import { saveSession } from "./session";

export type DeviceAuthStatus = "pending" | "approved" | "denied" | "expired" | "error";

export interface DeviceAuthCallbacks {
  onCodeReceived?: (code: DeviceCodeResponse) => void;
  onStatusChange?: (status: DeviceAuthStatus) => void;
  onSuccess?: (token: DeviceTokenResponse) => void;
  onError?: (error: Error) => void;
}

export interface DeviceAuthResult {
  success: boolean;
  token?: DeviceTokenResponse;
  error?: Error;
}

export class DeviceAuthService {
  private pollingInterval: number = 5000;
  private isPolling: boolean = false;
  private abortController: AbortController | null = null;

  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    return publicApi.requestDeviceCode();
  }

  async pollForToken(
    deviceCode: string,
    callbacks?: DeviceAuthCallbacks,
  ): Promise<DeviceAuthResult> {
    this.isPolling = true;
    this.abortController = new AbortController();

    try {
      while (this.isPolling) {
        if (this.abortController.signal.aborted) {
          throw new Error("Polling aborted");
        }

        try {
          const tokenResponse = await publicApi.pollDeviceToken({
            device_code: deviceCode,
          });

          const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
          await saveSession({
            sessionToken: tokenResponse.session_token,
            tokenType: tokenResponse.token_type,
            expiresAt,
          });

          callbacks?.onStatusChange?.("approved");
          callbacks?.onSuccess?.(tokenResponse);

          this.isPolling = false;
          return { success: true, token: tokenResponse };
        } catch (error: unknown) {
          if (isAuthorizationPending(error)) {
            callbacks?.onStatusChange?.("pending");
            await this.sleep(this.pollingInterval);
            continue;
          }

          if (isAuthorizationDenied(error)) {
            callbacks?.onStatusChange?.("denied");
            this.isPolling = false;
            const err = new Error("Authorization denied by user");
            callbacks?.onError?.(err);
            return { success: false, error: err };
          }

          if (isDeviceCodeExpired(error)) {
            callbacks?.onStatusChange?.("expired");
            this.isPolling = false;
            const err = new Error("Device code expired");
            callbacks?.onError?.(err);
            return { success: false, error: err };
          }

          this.isPolling = false;
          callbacks?.onStatusChange?.("error");
          const err = error instanceof Error ? error : new Error("Unknown error");
          callbacks?.onError?.(err);
          return { success: false, error: err };
        }
      }

      return { success: false, error: new Error("Polling stopped") };
    } finally {
      this.isPolling = false;
      this.abortController = null;
    }
  }

  async startAuth(callbacks?: DeviceAuthCallbacks): Promise<DeviceAuthResult> {
    try {
      const codeResponse = await this.requestDeviceCode();

      this.pollingInterval = (codeResponse.interval || 5) * 1000;

      callbacks?.onCodeReceived?.(codeResponse);
      callbacks?.onStatusChange?.("pending");

      // Small delay to let users see the code before browser opens
      setTimeout(() => {
        open(codeResponse.verification_uri_complete);
      }, 500);

      return await this.pollForToken(codeResponse.device_code, callbacks);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Failed to start auth");
      callbacks?.onError?.(err);
      callbacks?.onStatusChange?.("error");
      return { success: false, error: err };
    }
  }

  stopPolling(): void {
    this.isPolling = false;
    this.abortController?.abort();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const deviceAuth = new DeviceAuthService();
