declare module "@repo/tui";
declare module "open" {
  export default function open(target: string): Promise<void>;
}
