import { api } from "@repo/backend";
import type { ConvexHttpClient } from "convex/browser";
import { createConvexClient } from "../config";
import type { DeviceAuthStatus, DeviceCodeResponse, DeviceTokenResponse } from "../types";
import { isAuthorizationDenied, isAuthorizationPending, isDeviceCodeExpired } from "../types";
import { saveSession } from "./session";

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
  private client: ConvexHttpClient;
  private pollingInterval: number = 5000;
  private isPolling: boolean = false;
  private abortController: AbortController | null = null;

  constructor() {
    this.client = createConvexClient();
  }

  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const response = await this.client.mutation(api.deviceAuth.requestDeviceCode, {});
    return response as DeviceCodeResponse;
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
          const response = await this.client.mutation(api.deviceAuth.pollDeviceToken, {
            device_code: deviceCode,
          });

          const tokenResponse = response as DeviceTokenResponse;

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

      this.openBrowser(codeResponse.verification_uri_complete);

      return await this.pollForToken(codeResponse.device_code, callbacks);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Failed to start auth");
      callbacks?.onError?.(err);
      return { success: false, error: err };
    }
  }

  stopPolling(): void {
    this.isPolling = false;
    this.abortController?.abort();
  }

  private openBrowser(url: string): void {
    try {
      const platform = process.platform;
      const command =
        platform === "darwin"
          ? ["open", url]
          : platform === "win32"
            ? ["cmd", "/c", "start", url]
            : ["xdg-open", url];

      Bun.spawn(command);
    } catch {
      // ignore
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const deviceAuth = new DeviceAuthService();
