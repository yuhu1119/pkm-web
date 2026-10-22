/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** 前端部署子路径，如 /design；根路径为 / */
  readonly VITE_BASE_PATH?: string;
  readonly VITE_PROXY_TARGET?: string;
  readonly VITE_API_PREFIX?: string;
  readonly VITE_SSO_LOGOUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
