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
 * 从 URL 解析当前产品知识工作台 ID。
 * 产品列表属于平台产品管理，不算进入工作台。
 * @param {string} pathname
 */
export function parseWorkspaceProductId(pathname: string): number | null {
  const match = pathname.match(/^\/products\/(\d+)(.*)$/);
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
  if (!parseWorkspaceProductId(pathname)) {
    return workspacePath(nextId);
  }
  return pathname.replace(/^\/products\/\d+/, `/products/${nextId}`);
}

/**
 * 读取请求应携带的产品 ID：优先 URL，其次本地记忆。
 */
export function resolveProductId(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = parseWorkspaceProductId(window.location.pathname);
  if (fromUrl) return String(fromUrl);
  const stored = localStorage.getItem("pkm_product_id") || "";
  return stored !== "0" ? stored : "";
}
