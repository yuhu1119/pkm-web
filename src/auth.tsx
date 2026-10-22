import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, isUserInfo, UserInfo } from "./api";

interface AuthState {
  user: UserInfo | null;
  loading: boolean;
  refresh: () => Promise<UserInfo>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * 提供平台 SSO 登录态：只读 /api/auth/me，不再使用本地账号密码。
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * 重新读取登录态。轮询时不要把整页打回 loading，避免闪烁。
   * @param {boolean} [boot]
   */
  const refresh = useCallback(async (boot = false) => {
    if (boot) {
      setLoading(true);
    }
    try {
      const res = await api.get("/api/auth/me");
      if (!isUserInfo(res.data)) {
        setUser(null);
        const err = Object.assign(new Error("登录态无效"), {
          response: { status: 401, data: { detail: "登录态无效" } },
        });
        throw err;
      }
      setUser(res.data);
      return res.data;
    } catch (err) {
      setUser(null);
      throw err;
    } finally {
      if (boot) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh(true).catch(() => undefined);
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh: () => refresh(false),
      logout: () => {
        api.post("/api/audit/visit", { path: "/logout", title: "退出登录" }).catch(() => undefined).finally(() => {
          const dest = import.meta.env.VITE_SSO_LOGOUT || import.meta.env.BASE_URL || "/";
          window.location.href = dest;
        });
      },
    }),
    [user, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 是否为可配置系统的管理员。
 * @param {UserInfo | null | undefined} user
 */
export function isAdmin(user?: UserInfo | null) {
  return user?.role === "admin";
}

/**
 * 已开通账号或管理员可进入系统。
 * @param {UserInfo | null | undefined} user
 */
export function hasAccess(user?: UserInfo | null) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.allowed !== false;
}

/** 账号能力项，给设置页勾选。 */
export const ACCOUNT_CAPS: { key: string; label: string; group: string }[] = [
  { key: "product_create", label: "新建产品", group: "产品" },
  { key: "product_edit_own", label: "编辑自己创建的产品", group: "产品" },
  { key: "product_edit_others", label: "编辑他人创建的产品", group: "产品" },
  { key: "product_delete_own", label: "删除自己创建的产品", group: "产品" },
  { key: "product_delete_others", label: "删除他人创建的产品", group: "产品" },
  { key: "entity_create", label: "新建对象 / 实例", group: "对象与实例" },
  { key: "entity_edit_own", label: "编辑自己创建的对象 / 实例", group: "对象与实例" },
  { key: "entity_edit_others", label: "编辑他人创建的对象 / 实例", group: "对象与实例" },
  { key: "entity_delete_own", label: "删除自己创建的对象 / 实例", group: "对象与实例" },
  { key: "entity_delete_others", label: "删除他人创建的对象 / 实例", group: "对象与实例" },
  { key: "source_write", label: "收集文档并分析抽取", group: "收集" },
  { key: "release_write", label: "新建知识版本", group: "知识包与应用" },
  { key: "pack_write", label: "打包知识包", group: "知识包与应用" },
  { key: "pack_download", label: "下载知识包", group: "知识包与应用" },
  { key: "app_write", label: "知识应用与对接 AI", group: "知识包与应用" },
];

/** 新建成员默认能力：可建、可改自己的，不能改删他人，也不能收集抽取。 */
export const DEFAULT_MEMBER_CAPS: Record<string, boolean> = {
  product_create: true,
  product_edit_own: true,
  product_edit_others: false,
  product_delete_own: false,
  product_delete_others: false,
  entity_create: true,
  entity_edit_own: true,
  entity_edit_others: false,
  entity_delete_own: true,
  entity_delete_others: false,
  source_write: false,
  release_write: false,
  pack_write: false,
  pack_download: false,
  app_write: false,
};

/** 无权限时的 toast 文案。 */
export const CAP_HINTS: Record<string, string> = {
  product_create: "没有新建产品权限",
  product_write: "没有该产品的编辑权限",
  entity_create: "没有新建对象或实例的权限",
  source_write: "没有收集与抽取权限",
  release_write: "没有新建知识版本权限",
  pack_write: "没有打包知识包权限",
  pack_download: "没有下载知识包权限",
  app_write: "没有知识应用与对接 AI 权限",
};

/**
 * 是否具备某项能力。管理员全开。
 * @param {UserInfo | null | undefined} user
 * @param {string} cap
 */
export function hasCap(user: UserInfo | null | undefined, cap: string) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.caps && cap in user.caps) return Boolean(user.caps[cap]);
  return Boolean(DEFAULT_MEMBER_CAPS[cap]);
}

/**
 * 按创建人判断自己 / 他人能力。
 * @param {UserInfo | null | undefined} user
 * @param {string | undefined} createdBy
 * @param {string} ownCap
 * @param {string} othersCap
 */
export function canMutate(user: UserInfo | null | undefined, createdBy: string | undefined, ownCap: string, othersCap: string) {
  const mine = Boolean(createdBy) && createdBy === user?.username;
  return hasCap(user, mine ? ownCap : othersCap);
}

/**
 * 产品是否在线。空状态视为在线。
 * @param {{ status?: string; online?: boolean } | null | undefined} product
 */
export function isProductOnline(product?: { status?: string; online?: boolean } | null) {
  if (!product) return false;
  if (product.online === false) return false;
  const status = product.status || "active";
  return status !== "offline" && status !== "inactive";
}

/**
 * 当前产品工作台能否写入。在线产品跟能力开关；下架仅产品维护人。
 * @param {UserInfo | null | undefined} user
 * @param {{ status?: string; online?: boolean; created_by?: string } | null | undefined} product
 */
export function canWriteProduct(
  user?: UserInfo | null,
  product?: { status?: string; online?: boolean; created_by?: string } | null,
) {
  if (!user || !product) return false;
  if (user.role === "admin") return true;
  if (isProductOnline(product)) return true;
  return canMutate(user, product.created_by, "product_edit_own", "product_edit_others");
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
