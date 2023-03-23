import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["lib/main.ts"],
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["esm", "cjs"],
});
