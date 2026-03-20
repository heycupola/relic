/* Extended type declarations for the Next.js app. */

declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
