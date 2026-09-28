import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, UserInfo } from "./api";

interface AuthState {
  user: UserInfo | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * 提供平台 SSO 登录态：只读 /api/auth/me，不再使用本地账号密码。
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      logout: () => {
        api.post("/api/audit/visit", { path: "/logout", title: "退出登录" }).catch(() => undefined).finally(() => {
          const dest = import.meta.env.VITE_SSO_LOGOUT || "/";
          window.location.href = dest;
        });
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 读取认证上下文。
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("AuthProvider missing");
  }
  return ctx;
}
