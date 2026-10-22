import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_PROXY_TARGET;
  const prefix = (env.VITE_API_PREFIX || "").replace(/\/$/, "");
  /** 与网关子路径一致，构建后 JS/CSS 会变成 /design/assets/... */
  const rawBase = (env.VITE_BASE_PATH || "/").trim() || "/";
  const base = rawBase === "/" ? "/" : `/${rawBase.replace(/^\/|\/$/g, "")}/`;
  return {
    base,
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
