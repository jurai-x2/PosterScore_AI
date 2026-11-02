import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const clientTimeout = Number(env.VITE_ANALYZE_TOTAL_BUDGET_MS || 100_000) + 20_000;
  const proxyTimeout = clientTimeout + 10_000;
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": { target: "http://localhost:8787", timeout: proxyTimeout, proxyTimeout } }
    }
  };
});
