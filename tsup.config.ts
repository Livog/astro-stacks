import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/stacks.ts", "src/integration.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  outDir: "dist",
});
