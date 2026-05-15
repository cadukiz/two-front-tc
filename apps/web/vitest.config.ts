import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// jsdom env so component tests can mount React in later waves.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
