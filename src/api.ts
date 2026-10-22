import axios from "axios";
import { goLogin, isLoginLocation, resolveProductId } from "./paths";

/**
 * 后端项目前缀，例如 `/api/ProductKnowledgeModel`。同域网关下不要写死主机。
 */
export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

/**
 * 取出接口错误里的 detail，避免只看到 Request failed with status code 400。
 * @param {unknown} err
 * @param {string} [fallback]
 */
export function apiErrorDetail(err: unknown, fallback = "请求失败"): string {
  const rec = err as { response?: { status?: number; data?: { detail?: unknown } | string }; message?: string };
  const url = String((rec as { config?: { url?: string } })?.config?.url || "");
  if (rec?.response?.status === 404 && url.includes("/api/llm/complete")) {
    return "短补全接口尚未同步到运行环境。请执行 pkm-api/sync.sh，再到 SpeedLoop 点 Git 同步。";
  }
  if (rec?.response?.status === 504 || rec?.response?.status === 502) {
    return "网关断开了大模型补全。请确认系统设置探测成功后重试。";
  }
  const data = rec?.response?.data;
  const recData = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const detail = recData?.detail ?? recData?.msg ?? recData?.message ?? recData?.error;
  let text = "";
  if (typeof detail === "string" && detail.trim()) {
    text = detail.trim();
  } else if (Array.isArray(detail) && detail[0] != null) {
    text = String(detail[0]);
  } else if (typeof data === "string" && data.trim()) {
    text = data.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  } else {
    text = rec?.message || "";
  }
  if (/Request failed with status code 500/i.test(text)) {
    text = "后端 Worker 报错。请执行 pkm-api/sync.sh，再到 SpeedLoop 点 Git 同步（需包含 constants.lua、router.lua、routes_skills.lua）。";
  }
  if ((text.includes("反序列化") || /deserializ/i.test(text)) && !text.includes("JoyBuilder")) {
    return "JoyBuilder 拒绝了解析本次抽取请求（请求体过大或含非法字符），与文件是不是 PDF 无关。请确认系统设置探测仍成功，然后只勾选一个一级模型再抽。";
  }
  if (text.includes("模型不存在") || /model[_ ]?not[_ ]?found/i.test(text) || text.includes("短探测成功")) {
    if (text.includes("短探测") || text.includes("更长")) {
      return text;
    }
    return "JoyBuilder 拒绝了本次抽取。系统设置探测成功只说明短对话通了，抽取是另一次更长的请求。请只勾选一个一级模型后重试，不必改已验证成功的模型标识。";
  }
  if (/504|502|Gateway Time-out|gateway timeout/i.test(text)) {
    return "网关断开了大模型补全。请确认系统设置探测成功后重试。";
  }
  if (/额度|预算|quota|budget/i.test(text) && /用尽|不足|exceed|exhaust/i.test(text)) {
    return "本月大模型额度已用尽，无法自动分析填写。文档已保存，不会按文档对齐填写字段。请到知识治理中手工添加并编辑。";
  }
  if (/module:db:|查询超时/.test(text) || /文档太多或单篇过长/.test(text)) {
    return "一次分析的文档太多或单篇过长，数据库读写超时。请少勾选几篇，或等当前分析完成后再试。";
  }
  if (/timeout/i.test(text)) {
    return "大模型补全超时。请确认系统设置探测成功后重试。";
  }
  return text || fallback;
}

/**
 * 平台 SQLite 读写超时（勾选太多或正文太大）。
 * @param {unknown} err
 */
export function isDbTimeoutError(err: unknown): boolean {
  const text = `${apiErrorDetail(err, "")} ${String((err as { message?: string })?.message || "")}`;
  return /module:db:|查询超时|文档太多或单篇过长/.test(text);
}

/**
 * 是否为模型额度用尽（再调接口也不会成功）。
 * @param {unknown} err
 */
export function isLlmQuotaError(err: unknown): boolean {
  const text = `${apiErrorDetail(err, "")} ${String((err as { message?: string })?.message || "")}`;
  return /额度|预算|quota|budget/i.test(text) && /用尽|不足|exceed|exhaust/i.test(text);
}

/**
 * 额度用尽、模型未配置或标识错误等，此时不能自动填写。
 * @param {unknown} err
 */
export function isLlmUnavailableError(err: unknown): boolean {
  if (isLlmQuotaError(err)) return true;
  const text = `${apiErrorDetail(err, "")} ${String((err as { message?: string })?.message || "")}`;
  if (/短探测成功|另一次更长|只勾选一个一级模型/.test(text)) {
    return false;
  }
  return /模型不存在|请先在系统设置|请到系统设置|调用地址|模型标识|未配置|正确配置|探测失败|JoyBuilder 返回|API Key|鉴权|unauthorized|invalid.?api.?key|不会按文档对齐/i.test(
    text,
  );
}

/** 大模型不可用时，统一引导手工治理。 */
const LLM_MANUAL_HINT = "不会按文档对齐填写字段。请到知识治理中手工添加并编辑。";

/**
 * 额度用尽或配置不正确等原因，附带「不自动填、请手工治理」说明。
 * @param {unknown} err
 */
export function llmUnavailableReason(err: unknown): string {
  const detail = apiErrorDetail(err, "大模型当前不可用");
  if (detail.includes("手工添加")) return detail;
  return `${detail.replace(/[。.]?$/, "。")}${LLM_MANUAL_HINT}`;
}

/**
 * 去掉 null/NaN，避免网关「客户端请求反序列化失败」。
 * @param {Record<string, unknown>} obj
 */
export function jsonPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "number" && !Number.isFinite(value)) return;
    out[key] = value;
  });
  return out;
}

const GATEWAY_OK = new Set([0, 200, "0", "200", "0000", "ok", "OK", "success", "SUCCESS"]);

/**
 * 网关常把失败包成 HTTP 200 的 `{ code, msg, data }`。非成功则返回错误文案。
 * @param {unknown} payload
 */
export function gatewayFailMessage(payload: unknown): string {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }
  const rec = payload as Record<string, unknown>;
  const enveloped =
    Object.prototype.hasOwnProperty.call(rec, "data") &&
    (Object.prototype.hasOwnProperty.call(rec, "code") ||
      Object.prototype.hasOwnProperty.call(rec, "success") ||
      Object.prototype.hasOwnProperty.call(rec, "msg"));
  if (!enveloped) {
    return "";
  }
  if (rec.success === false) {
    return String(rec.msg || rec.message || rec.detail || "请求失败");
  }
  const code = rec.code;
  if (code === undefined || code === null || code === "" || GATEWAY_OK.has(code as never)) {
    return "";
  }
  const numeric = typeof code === "number" ? code : Number(code);
  if (Number.isFinite(numeric) && (numeric === 0 || numeric === 200)) {
    return "";
  }
  return String(rec.msg || rec.message || rec.detail || `接口错误 ${String(code)}`);
}

/**
 * 解开网关信封 `{ code, data }` / `{ success, data }`，数组原样返回。
 * @param {unknown} payload
 */
export function unwrapApiBody(payload: unknown): unknown {
  if (payload == null || Array.isArray(payload) || typeof payload !== "object") {
    return payload;
  }
  const rec = payload as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(rec, "data")) {
    return payload;
  }
  if (Object.prototype.hasOwnProperty.call(rec, "code") || Object.prototype.hasOwnProperty.call(rec, "success") || Object.prototype.hasOwnProperty.call(rec, "msg")) {
    return rec.data;
  }
  return payload;
}

/**
 * 登录态接口是否已经带回可用用户。
 * @param {unknown} data
 */
export function isUserInfo(data: unknown): data is UserInfo {
  return Boolean(data && typeof data === "object" && typeof (data as UserInfo).username === "string" && (data as UserInfo).username.trim());
}

/**
 * 把列表接口收成数组，避免 Lua `{}` 或信封导致 `.find` 崩溃。
 * @param {unknown} payload
 */
export function asList<T = unknown>(payload: unknown): T[] {
  const body = unwrapApiBody(payload);
  if (Array.isArray(body)) {
    return body as T[];
  }
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    for (const key of ["items", "list", "products", "rows", "records"]) {
      if (Array.isArray(rec[key])) {
        return rec[key] as T[];
      }
    }
    const values = Object.values(rec);
    if (values.length > 0 && values.every((item) => item && typeof item === "object" && "id" in (item as object))) {
      return values as T[];
    }
  }
  return [];
}

/**
 * 浏览器里能读到的京东 pin（非 HttpOnly）。Worker 用它补当前登录人。
 */
function jdPinFromCookie(): string {
  const match = String(document.cookie || "").match(/(?:^|;\s*)pin=([^;]+)/i);
  if (!match?.[1]) {
    return "";
  }
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

api.interceptors.request.use((config) => {
  const productId = resolveProductId();
  if (productId && productId !== "0") {
    config.headers["X-Product-Id"] = productId;
  }
  const pin = jdPinFromCookie();
  if (pin) {
    config.headers["X-Api-Erp"] = pin;
  }
  return config;
});

api.interceptors.response.use(
  (resp) => {
    if (resp.config.responseType === "blob") {
      return resp;
    }
    const raw = resp.data;
    if (typeof raw === "string" && /<html/i.test(raw)) {
      const err = Object.assign(new Error("需要平台 SSO 登录"), {
        response: { status: 401, data: { detail: "需要平台 SSO 登录" } },
        config: resp.config,
      });
      return Promise.reject(err);
    }
    const fail = gatewayFailMessage(raw);
    if (fail) {
      const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const code = Number(rec.code);
      const status = Number.isFinite(code) && code >= 400 && code < 600 ? code : 401;
      const err = Object.assign(new Error(fail), {
        response: { status, data: { detail: fail } },
        config: resp.config,
      });
      return Promise.reject(err);
    }
    resp.data = unwrapApiBody(raw);
    return resp;
  },
  (error) => {
    if (error?.response?.status === 401 && !isLoginLocation()) {
      goLogin();
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

const JOYSPACE_PATH_SKIP = new Set([
  "h",
  "personal",
  "team",
  "teams",
  "space",
  "spaces",
  "folder",
  "folders",
  "home",
  "login",
  "pages",
  "page",
  "doc",
  "docs",
  "sheet",
  "sheets",
  "table",
  "ppt",
  "board",
  "mind",
  "meeting",
]);

/** JoySpace 输入框占位。 */
export const JOYSPACE_URL_PLACEHOLDER = "粘贴 https://joyspace.jd.com 开头的文档链接";

/** JoySpace 读取说明。 */
export const JOYSPACE_URL_HINT = "使用当前登录身份读取 JoySpace 文档。";

/**
 * 从 JoySpace 链接取出页面 ID。https://joyspace.jd.com 下能解析出文档 ID 即可。
 * @param {string} url
 */
export function joySpacePageId(url: string): string {
  const raw = String(url || "").trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (!/(^|\.)joyspace\.jd\.com$/i.test(parsed.hostname)) {
    return "";
  }
  const pathMatch = parsed.pathname.match(
    /\/(?:pages|page|doc|sheets?|table|ppt|board|mind|meeting)\/([A-Za-z0-9_-]+)/i,
  );
  if (pathMatch?.[1]) {
    return pathMatch[1];
  }
  const queryId = parsed.searchParams.get("pageId") || parsed.searchParams.get("page_id") || "";
  if (queryId && /^[A-Za-z0-9_-]+$/.test(queryId)) {
    return queryId;
  }
  const last = parsed.pathname.split("/").filter(Boolean).pop() || "";
  if (last.length >= 8 && /^[A-Za-z0-9_-]+$/.test(last) && !JOYSPACE_PATH_SKIP.has(last.toLowerCase())) {
    return last;
  }
  return "";
}

/**
 * 把链接交给后端，按当前登录人读取 JoySpace 正文。
 * @param {string} url
 * @param {string} [targetTypeId]
 */
export async function ingestJoySpace(url: string, targetTypeId = "") {
  if (!joySpacePageId(url)) {
    throw new Error("请粘贴 https://joyspace.jd.com 开头的文档链接");
  }
  return api.post("/api/sources/fetch", { url, target_type_id: targetTypeId }, { timeout: 25000 });
}

const MAX_UPLOAD_CHARS = 40000;

/**
 * 过长正文会撑爆网关 JSON，上传前截头尾。
 * @param {string} text
 */
export function clipSourceText(text: string): string {
  const value = String(text || "");
  if (value.length <= MAX_UPLOAD_CHARS) {
    return value;
  }
  const head = Math.floor(MAX_UPLOAD_CHARS * 0.7);
  const tail = MAX_UPLOAD_CHARS - head - 20;
  return `${value.slice(0, head)}\n…(正文过长已截断)…\n${value.slice(-tail)}`;
}

/**
 * 上传标题保留原文件名（含 .pdf）。只去掉路径分隔符。
 * @param {string} name
 */
function safeUploadTitle(name: string): string {
  const trimmed = String(name || "upload.txt").replace(/[/\\]/g, "_").trim();
  return trimmed || "upload.txt";
}

/**
 * 上传本地解析后的正文。
 * @param {{ title: string, content: string }} payload
 * @param {string} [targetTypeId]
 */
export function uploadSourceDocument(payload: { title: string; content: string }, targetTypeId = "") {
  return api.post("/api/sources/upload", {
    title: safeUploadTitle(payload.title),
    content: clipSourceText(payload.content),
    target_type_id: targetTypeId,
  });
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

/**
 * 实例 payload 收成字段 map，避免后端空表编成数组后治理页全空。
 * @param {unknown} raw
 */
export function asPayload(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  const take = (key: string, value: unknown) => {
    if (value == null || key === "") return;
    if (typeof value === "string") {
      out[key] = value;
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value);
      return;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      const rec = value as Record<string, unknown>;
      const nested = rec.value ?? rec.text ?? rec.content;
      if (nested != null && nested !== "") {
        out[key] = String(nested);
      }
    }
  };
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return;
      const rec = item as Record<string, unknown>;
      const key = rec.key ?? rec.name ?? rec.field;
      const val = rec.value ?? rec.text ?? rec.content;
      if (key != null && val != null) {
        take(String(key), val);
        return;
      }
      Object.entries(rec).forEach(([k, v]) => take(k, v));
    });
    return out;
  }
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => take(key, value));
  return out;
}

const EXTRACT_META_KEYS = new Set([
  "_uid",
  "type_id",
  "entity_id",
  "type",
  "type_name",
  "model_code",
  "model_name",
  "name",
  "title",
  "summary",
  "desc",
  "payload",
  "tags",
  "confidence",
  "write_action",
  "write_reason",
  "similar",
  "matched_id",
  "protected",
  "needs_compare",
]);

/**
 * 抽取结果收成治理 payload：嵌套 payload 与扁平字段合并，丢掉列表元数据。
 * @param {Record<string, unknown> | null | undefined} item
 */
export function extractedPayload(item?: Record<string, unknown> | null): Record<string, string> {
  if (!item) return {};
  const rest: Record<string, unknown> = {};
  Object.entries(item).forEach(([key, value]) => {
    if (!EXTRACT_META_KEYS.has(key)) rest[key] = value;
  });
  return { ...asPayload(item.payload), ...asPayload(rest) };
}

/**
 * 兼容详情 `{ entity, type }` 与扁平实例。
 * @param {unknown} data
 */
export function parseEntityDetail(data: unknown): { entity: Entity | null; type?: KnowledgeType } {
  if (!data || typeof data !== "object") {
    return { entity: null };
  }
  const rec = data as Record<string, unknown>;
  const inner = rec.entity;
  if (inner && typeof inner === "object" && "id" in (inner as object)) {
    const entity = { ...(inner as Entity), payload: asPayload((inner as Entity).payload) };
    return { entity, type: rec.type as KnowledgeType | undefined };
  }
  if ("id" in rec && "type_id" in rec) {
    const entity = { ...(rec as unknown as Entity), payload: asPayload(rec.payload) };
    return { entity };
  }
  return { entity: null };
}

export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  role: string;
  allowed?: boolean;
  caps?: Record<string, boolean>;
  product_scope?: "all" | "assigned";
  product_permissions?: Record<string, { can_read: boolean; can_write: boolean }>;
  model_permissions: Record<string, { can_read: boolean; can_write: boolean }>;
}

/**
 * 从模型输出里抽出 JSON 对象；输出被截断时尽量抢救已写出的字段。
 * @param {string} text
 */
export function extractLlmJson(text: string): Record<string, unknown> | null {
  let raw = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "");
  const obj = raw.indexOf("{");
  const arr = raw.indexOf("[");
  let start = -1;
  if (obj >= 0 && arr >= 0) start = Math.min(obj, arr);
  else start = obj >= 0 ? obj : arr;
  if (start < 0) return salvageJsonFields(raw);
  raw = raw.slice(start);
  const parsed = parseJsonLoose(raw);
  if (parsed) return parsed;
  return salvageJsonFields(raw);
}

/**
 * 解析完整或截断后补全括号的 JSON。
 * @param {string} raw
 */
function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const attempts = [raw];
  const lastBrace = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (lastBrace > 0) attempts.push(raw.slice(0, lastBrace + 1));
  const lastQuote = raw.lastIndexOf('"');
  if (lastQuote > 0) attempts.push(`${raw.slice(0, lastQuote + 1)}}`);
  const lastComma = raw.lastIndexOf('",');
  if (lastComma > 0) attempts.push(`${raw.slice(0, lastComma + 1)}}`);
  for (const item of attempts) {
    try {
      const data = JSON.parse(item);
      if (data && typeof data === "object") return data as Record<string, unknown>;
    } catch {
      /* 再试下一种补全 */
    }
  }
  return null;
}

/**
 * 从残缺 JSON 里捞 `"key": "value"`。
 * @param {string} raw
 */
function salvageJsonFields(raw: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const re = /"([^"\\]+)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null = re.exec(raw);
  while (match) {
    out[match[1]] = match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    match = re.exec(raw);
  }
  return Object.keys(out).length ? out : null;
}

let quotaBlocked: unknown = null;

/**
 * 本次页面是否已确认大模型不可用（额度或配置）。
 */
export function isLlmQuotaBlocked(): boolean {
  return Boolean(quotaBlocked);
}

/**
 * 记下额度/配置失败，后续不再自动填写。
 * @param {unknown} err
 */
export function markLlmUnavailable(err: unknown): void {
  if (isLlmUnavailableError(err)) quotaBlocked = err;
}

/**
 * 本页已确认的大模型不可用原因。
 */
export function llmBlockedReason(): string {
  return quotaBlocked ? llmUnavailableReason(quotaBlocked) : "";
}

/**
 * 独立分析补全。额度用尽后本页不再重复打模型；超时则缩短正文再试。
 * @param {{ role: string, content: string }[]} messages
 * @param {number} [maxTokens]
 */
export async function llmComplete(messages: { role: string; content: string }[], maxTokens = 800): Promise<string> {
  if (quotaBlocked) {
    throw quotaBlocked;
  }
  const run = async (packed: { role: string; content: string }[], tokens: number, wait: number) => {
    const res = await api.post(
      "/api/llm/complete",
      jsonPayload({ messages: packed, max_tokens: tokens, read_timeout: wait }),
      { timeout: wait + 8000 },
    );
    return String((res.data as { text?: unknown } | null)?.text || "");
  };
  try {
    const text = await run(messages, Math.min(maxTokens, 900), 20000);
    if (text.trim()) return text;
  } catch (err) {
    if (isLlmUnavailableError(err)) {
      quotaBlocked = err;
      throw err;
    }
    const status = Number((err as { response?: { status?: number } })?.response?.status || 0);
    if (status && status !== 502 && status !== 504 && status !== 400) throw err;
  }
  const clipped = messages.map((item) => ({
    ...item,
    content: String(item.content || "").slice(0, 1600),
  }));
  try {
    return await run(clipped, 480, 12000);
  } catch (err) {
    if (isLlmUnavailableError(err)) quotaBlocked = err;
    throw err;
  }
}
