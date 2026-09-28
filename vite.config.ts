import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_PROXY_TARGET;
  const prefix = (env.VITE_API_PREFIX || "").replace(/\/$/, "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: proxyTarget
        ? {
            "/api": {
              target: proxyTarget,
              changeOrigin: true,
              cookieDomainRewrite: "",
              rewrite: (path) => `${prefix}${path}`,
            },
            "/v1": {
              target: proxyTarget,
              changeOrigin: true,
              cookieDomainRewrite: "",
              rewrite: (path) => `${prefix}${path}`,
            },
          }
        : undefined,
    },
  };
});
