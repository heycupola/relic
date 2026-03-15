import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    setupFiles: ["./test/vitest.setup.ts"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["convex/**/*.ts"],
      exclude: [
        "convex/_generated/**",
        "convex/betterAuth/_generated/**",
        "convex/betterAuth/generatedSchema.ts",
        "test/**",
      ],
    },
  },
});
