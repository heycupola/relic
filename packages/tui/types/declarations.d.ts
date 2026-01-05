declare module "react-devtools-core" {
  export function connectToDevTools(options?: {
    host?: string;
    port?: number;
    useHttps?: boolean;
    websocket?: unknown;
  }): void;
}
