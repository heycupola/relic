import { cloudflareAdapterFactory } from "./cloudflare";
import { flyAdapterFactory } from "./fly";
import { githubAdapterFactory } from "./github";
import type { AdapterFactory } from "./types";
import { vercelAdapterFactory } from "./vercel";

export const ADAPTER_FACTORIES: AdapterFactory[] = [
  vercelAdapterFactory,
  cloudflareAdapterFactory,
  githubAdapterFactory,
  flyAdapterFactory,
];

export function findAdapterFactory(target: string): AdapterFactory | undefined {
  const normalized = target.trim().toLowerCase();
  return ADAPTER_FACTORIES.find((factory) => factory.aliases.includes(normalized));
}

export function supportedTargets(): string {
  return ADAPTER_FACTORIES.map((factory) => factory.id).join(", ");
}
