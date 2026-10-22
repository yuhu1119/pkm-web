/**
 * 平台页与产品知识工作台的路径约定。
 * 平台页不绑定产品；知识治理只出现在 /products/:id 之下。
 */

export const KNOWLEDGE_MODELS = [
  { code: 1, name: "产品基准" },
  { code: 2, name: "模块模型" },
  { code: 3, name: "对象与数据" },
  { code: 4, name: "业务流程" },
  { code: 5, name: "状态与规则" },
  { code: 6, name: "权限模型" },
  { code: 7, name: "系统关系" },
  { code: 8, name: "约束模型" },
  { code: 9, name: "用户与业务" },
  { code: 10, name: "决策与演进" },
] as const;

const WORKSPACE_REST = /^(?:\/(?:overview|structure|knowledge(?:\/.*)?|sources|pack|search|graph|relations)?)?$/;

/**
 * 去掉前端部署子路径（Vite base），例如 /design/products/1 → /products/1。
 * @param {string} pathname
 */
export function stripAppBase(pathname: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  if (!base) return pathname;
  if (pathname === base || pathname === `${base}/`) return "/";
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length) || "/";
  return pathname;
}

/**
 * React Router 的 basename，无尾斜杠。根路径部署时为空字符串。
 */
export function appBasename(): string {
  return (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
}

/**
 * 从 URL 解析当前产品知识工作台 ID。
 * 产品列表属于平台产品管理，不算进入工作台。
 * @param {string} pathname
 */
export function parseWorkspaceProductId(pathname: string): number | null {
  const match = stripAppBase(pathname).match(/^\/products\/(\d+)(.*)$/);
  if (!match) return null;
  const id = Number(match[1]);
  if (!(id > 0)) return null;
  const rest = match[2] || "";
  return WORKSPACE_REST.test(rest) ? id : null;
}

/**
 * 是否为左侧一级菜单对应的页面（不需要面包屑和返回箭头）。
 * @param {string} pathname
 */
export function isTopMenuPage(pathname: string): boolean {
  pathname = stripAppBase(pathname);
  if (
    pathname === "/" ||
    pathname === "/landscape" ||
    pathname === "/ask" ||
    pathname === "/apps" ||
    pathname === "/skills" ||
    pathname === "/products" ||
    pathname === "/products/" ||
    pathname === "/settings"
  ) {
    return true;
  }
  const productId = parseWorkspaceProductId(pathname);
  if (!productId) return false;
  const rest = pathname.slice(`/products/${productId}`.length) || "";
  return (
    rest === "" ||
    rest === "/" ||
    rest === "/overview" ||
    rest === "/structure" ||
    rest === "/sources" ||
    rest === "/pack" ||
    rest === "/graph" ||
    rest === "/relations" ||
    rest === "/knowledge" ||
    /^\/knowledge\/\d+$/.test(rest)
  );
}

/**
 * 产品知识工作台路径。
 * @param {number} productId
 * @param {string} [sub] 子路径，如 /structure、/knowledge/1
 */
export function workspacePath(productId: number, sub = ""): string {
  const suffix = !sub ? "" : sub.startsWith("/") ? sub : `/${sub}`;
  return `/products/${productId}${suffix}`;
}

/**
 * 切换工作台时保留当前子路径。
 * @param {string} pathname
 * @param {number} nextId
 */
export function swapWorkspaceProduct(pathname: string, nextId: number): string {
  const path = stripAppBase(pathname);
  if (!parseWorkspaceProductId(path)) {
    return workspacePath(nextId);
  }
  return path.replace(/^\/products\/\d+/, `/products/${nextId}`);
}

/**
 * 当前前端路由路径。Hash 路由读 hash，避免 /design/login 被当成服务器路径。
 */
export function currentAppPathname(): string {
  if (typeof window === "undefined") return "/";
  const hash = window.location.hash.replace(/^#/, "");
  const hashPath = (hash.split("?")[0] || "").trim();
  if (hashPath.startsWith("/")) return hashPath;
  if (hashPath) return `/${hashPath}`;
  return stripAppBase(window.location.pathname);
}

/**
 * 是否已在登录页。
 */
export function isLoginLocation(): boolean {
  if (typeof window === "undefined") return false;
  const path = currentAppPathname();
  return path === "/login" || path.endsWith("/login");
}

/**
 * 只改 hash 进入登录页，静态托管不必存在 /design/login 这个文件。
 */
export function goLogin(): void {
  if (isLoginLocation()) return;
  window.location.hash = "#/login";
}

/**
 * 读取请求应携带的产品 ID：优先 URL，其次本地记忆。
 */
export function resolveProductId(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = parseWorkspaceProductId(currentAppPathname());
  if (fromUrl) return String(fromUrl);
  const stored = localStorage.getItem("pkm_product_id") || "";
  return stored !== "0" ? stored : "";
}
