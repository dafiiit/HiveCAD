import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/lib/**/*.test.ts", "src/workers/**/*.test.ts"],
    exclude: ["**/*.tsx", "src/test/**", "src/lib/topology/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
