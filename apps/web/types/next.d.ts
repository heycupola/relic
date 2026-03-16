/* Type stubs for next/* modules provided by vinext at runtime.
   The actual `next` package is NOT installed to avoid polluting the
   Cloudflare Workers server bundle. */

declare module "next" {
  export interface Metadata {
    title?: string | { default?: string; template?: string } | null;
    description?: string | null;
    keywords?: readonly string[] | string[] | null;
    authors?: Array<{ name?: string; url?: string }> | null;
    creator?: string | null;
    publisher?: string | null;
    metadataBase?: URL | null;
    alternates?: {
      canonical?: string;
      types?: Record<string, string | Array<{ url: string; title?: string }>>;
    } | null;
    openGraph?: Record<string, unknown> | null;
    twitter?: Record<string, unknown> | null;
    robots?: string | Record<string, unknown> | null;
    other?: Record<string, string> | null;
    [key: string]: unknown;
  }

  export interface Viewport {
    width?: string;
    initialScale?: number;
    themeColor?: string | Array<{ media: string; color: string }>;
    [key: string]: unknown;
  }

  export interface MetadataRoute {
    [key: string]: unknown;
  }

  export namespace MetadataRoute {
    interface Sitemap
      extends Array<{
        url: string;
        lastModified?: Date | string;
        changeFrequency?: string;
        priority?: number;
      }> {}
    interface Robots {
      rules?: unknown;
      sitemap?: string | string[];
      [key: string]: unknown;
    }
    interface Manifest {
      [key: string]: unknown;
    }
  }
}

declare module "next/link" {
  import type { ComponentProps, ReactNode } from "react";
  interface LinkProps extends Omit<ComponentProps<"a">, "href"> {
    href: string | { pathname?: string; query?: Record<string, string> };
    prefetch?: boolean;
    replace?: boolean;
    children?: ReactNode;
    target?: string;
    rel?: string;
    className?: string;
  }
  const Link: React.FC<LinkProps>;
  export default Link;
}

declare module "next/image" {
  import type { ComponentProps, ReactNode } from "react";
  interface ImageProps extends Omit<ComponentProps<"img">, "src"> {
    src: string | { src: string; height: number; width: number };
    alt: string;
    width?: number;
    height?: number;
    fill?: boolean;
    priority?: boolean;
    className?: string;
    quality?: number;
  }
  const Image: React.FC<ImageProps>;
  export default Image;
}

declare module "next/navigation" {
  export function useRouter(): {
    push(href: string): void;
    replace(href: string): void;
    refresh(): void;
    back(): void;
    forward(): void;
    prefetch(href: string): void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function notFound(): never;
  export function redirect(url: string): never;
}

declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL;
    cookies: Map<string, string>;
  }
  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    static next(init?: ResponseInit): NextResponse;
  }
}

declare module "next/font/google" {
  interface FontOptions {
    subsets?: string[];
    variable?: string;
    weight?: string | string[];
    display?: string;
  }
  interface FontResult {
    className: string;
    variable: string;
    style: { fontFamily: string };
  }
  export function Geist(options: FontOptions): FontResult;
  export function Geist_Mono(options: FontOptions): FontResult;
  export function Space_Grotesk(options: FontOptions): FontResult;
}

declare module "next/script" {
  import type { ComponentProps } from "react";
  interface ScriptProps extends ComponentProps<"script"> {
    strategy?: "beforeInteractive" | "afterInteractive" | "lazyOnload" | "worker";
    id?: string;
    src?: string;
  }
  const Script: React.FC<ScriptProps>;
  export default Script;
}

declare module "next/og" {
  export class ImageResponse extends Response {
    constructor(
      element: React.ReactElement,
      options?: {
        width?: number;
        height?: number;
        fonts?: Array<{ name: string; data: ArrayBuffer; style?: string; weight?: number }>;
      },
    );
  }
}
