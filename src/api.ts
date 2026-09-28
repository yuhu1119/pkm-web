import axios from "axios";
import { resolveProductId } from "./paths";

/**
 * 后端项目前缀，例如 `/pkm-api`。同域网关下不要写死主机。
 */
export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const productId = resolveProductId();
  if (productId && productId !== "0") {
    config.headers["X-Product-Id"] = productId;
  }
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error?.response?.status === 401) {
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

/**
 * 带登录态下载文件。
 */
export async function downloadAuth(url: string, filename: string) {
  const res = await api.get(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

/**
 * 开放 API 的对外根地址，给知识应用页展示。
 */
export function publicApiOrigin() {
  if (API_BASE.startsWith("http")) {
    return API_BASE.replace(/\/$/, "");
  }
  return `${window.location.origin}${API_BASE}`;
}

/**
 * 读取纯文本文件；二进制格式本期不解析。
 */
export async function readPlainFile(file: File): Promise<{ title: string; content: string }> {
  const title = file.name || "upload.txt";
  if (/\.(docx|pdf|xlsx|xlsm)$/i.test(title)) {
    throw new Error("本期仅支持 .txt / .md / .html / .json，Word/PDF/Excel 解析后续迭代");
  }
  return { title, content: await file.text() };
}

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  refTypes?: string[];
  fill_hint?: string;
  custom?: boolean;
}

export interface KnowledgeType {
  entity_id: string;
  model_code: number;
  model_name: string;
  name: string;
  description: string;
  core_question: string;
  ai_value: string;
  knowledge_kind: string;
  tags: string[];
  ref_type_ids: string[];
  change_note: string;
  fields: FieldDef[];
  template_kind?: string;
  fill_mode?: string;
  inventory_group_field?: string;
}

export interface EntityRef {
  to_id?: number;
  from_id?: number;
  relation: string;
  to_name?: string;
  to_type_id?: string;
  from_name?: string;
  from_type_id?: string;
  direction?: string;
}

export interface Entity {
  id: number;
  type_id: string;
  model_code: number;
  model_name: string;
  type_name: string;
  name: string;
  summary: string;
  payload: Record<string, string>;
  tags: string[];
  status: string;
  version: number;
  steward_name?: string;
  steward_role?: string;
  steward_team?: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  refs: EntityRef[];
  knowledge_kind: string;
  origin?: string;
  stage?: string;
  completeness?: number;
  missing_fields?: { key: string; label: string }[];
  valid_complete?: boolean;
  has_source?: boolean;
  extract_ok?: boolean;
  locked?: boolean;
}

export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  role: string;
  model_permissions: Record<string, { can_read: boolean; can_write: boolean }>;
}
