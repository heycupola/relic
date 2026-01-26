import { api } from "@repo/backend";
import { ConvexHttpClient } from "convex/browser";
import type {
  DeviceCodeRequest,
  DeviceCodeResponse,
  DeviceTokenRequest,
  DeviceTokenResponse,
} from "./types/api";

const CONVEX_URL = process.env.CONVEX_URL ?? "https://your-deployment.convex.cloud";

function createClient(): ConvexHttpClient {
  return new ConvexHttpClient(CONVEX_URL);
}

export class PublicApi {
  private client: ConvexHttpClient;

  constructor() {
    this.client = createClient();
  }

  async requestDeviceCode(args: DeviceCodeRequest = {}): Promise<DeviceCodeResponse> {
    return this.client.mutation(api.deviceAuth.requestDeviceCode, { ...args });
  }

  async pollDeviceToken(args: DeviceTokenRequest): Promise<DeviceTokenResponse> {
    return this.client.mutation(api.deviceAuth.pollDeviceToken, { ...args });
  }
}

export const publicApi = new PublicApi();
