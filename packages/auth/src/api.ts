import { api } from "@repo/backend";
import { ConvexHttpClient } from "convex/browser";
import { CONVEX_URL } from "./constants";
import type {
  DeviceCodeRequest,
  DeviceCodeResponse,
  DeviceTokenRequest,
  DeviceTokenResponse,
} from "./types";

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
