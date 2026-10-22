import {
  api,
  asList,
  asPayload,
  extractLlmJson,
  jsonPayload,
  llmComplete,
  isLlmQuotaBlocked,
  isLlmUnavailableError,
  llmBlockedReason,
  llmUnavailableReason,
  markLlmUnavailable,
  type FieldDef,
  type KnowledgeType,
} from "./api";

const STEWARD = new Set(["steward_name", "steward_role", "steward_team"]);
const META_KEYS = new Set(["source", "source_version", "effective_from", "effective_to", "owner_module"]);
const STOP_HEADINGS = ["关键关系", "回答要求", "知识覆盖"];
/** 总览页/表格里常见的邻格标签，用来截断「吃到下一字段」的原文堆砌。 */
const CELL_STOPS = [
  "一、",
  "二、",
  "三、",
  "四、",
  "五、",
  "六、",
  "七、",
  "八、",
  "九、",
  "十、",
  "最后更新时间",
  "产品简称",
  "所属业务",
  "产品负责人",
  "知识ID",
  "知识类型",
  "一句话定义",
  "产品一句话定义",
  "产品核心定位",
  "项目 内容",
  "字段 填写内容",
  "当前版本",
  "维护人",
  "模块ID",
  "角色ID",
  "目标类型",
  "名称",
  "摘要",
  "来源版本",
  "生效时间",
  "失效时间",
  "所属模块",
  "来源",
  "产品是什么",
  "产品服务谁",
  "产品解决什么问题",
  "核心场景摘要",
  "产品核心场景",
  "产品核心价值",
  "核心价值主张",
  "产品定位公式",
  "属于本产品",
  "不属于本产品",
  "对象名称",
  "对象类型",
  "含义",
  "基本关系",
  "建设目标",
  "核心指标",
  "功能名称",
];

/**
 * 去掉维护人后的可填字段。
 * @param {KnowledgeType} type
 */
function usableFields(type: KnowledgeType): FieldDef[] {
  return (type.fields || []).filter((field) => field.key && !STEWARD.has(field.key));
}

/**
 * 转义正则特殊字符。
 * @param {string} value
 */
function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 是否是助手开场白，不能当名称或摘要。
 * @param {string} text
 */
export function isAssistantPreamble(text: string): boolean {
  const value = String(text || "").trim();
  return (
    /^你是「/.test(value) ||
    value.includes("产品知识助手") ||
    value.includes("只依据下列已治理") ||
    value.includes("不要编造未出现") ||
    value.startsWith("回答要求")
  );
}

/**
 * 标签到字段 key：中文名、英文 key、总览页/表格常用别名。
 * @param {KnowledgeType} type
 */
function labelEntries(type: KnowledgeType): { key: string; label: string }[] {
  const extra: Record<string, string[]> = {
    name: ["名称", "实例名称", "产品名称"],
    summary: ["摘要", "产品简介", "简介", "一句话定义"],
    identity: ["产品是什么", "产品核心定位"],
    target_users: ["产品服务谁"],
    problems: ["产品解决什么问题"],
    core_scenarios: ["核心场景摘要", "产品核心场景", "核心场景"],
    core_value: ["产品核心价值"],
    value_proposition: ["核心价值主张"],
    positioning_formula: ["产品定位公式"],
    source_version: ["来源版本", "当前版本"],
    effective_from: ["生效时间"],
    effective_to: ["失效时间"],
    goals: ["建设目标", "用户目标", "业务目标"],
    kpis: ["核心指标"],
    feature_name: ["功能名称"],
  };
  const rows: { key: string; label: string }[] = [];
  const push = (key: string, label: string) => {
    if (label) rows.push({ key, label });
  };
  (extra.name || []).forEach((label) => push("name", label));
  (extra.summary || []).forEach((label) => push("summary", label));
  usableFields(type).forEach((field) => {
    push(field.key, field.label || field.key);
    (extra[field.key] || []).forEach((label) => push(field.key, label));
  });
  return rows.sort((a, b) => b.label.length - a.label.length);
}

/**
 * 命中位置是否其实是更长标签的前缀，例如「来源」对上「来源版本」。
 * @param {string} source
 * @param {number} labelAt
 * @param {string} label
 * @param {string[]} labels
 */
function isShorterAlias(source: string, labelAt: number, label: string, labels: string[]): boolean {
  return labels.some((other) => other.length > label.length && source.startsWith(other, labelAt));
}

/**
 * 在单元格正文里切到下一个标签或章节标题。
 * @param {string} value
 * @param {string[]} stops
 */
function cutAtStops(value: string, stops: string[]): string {
  let next = String(value || "");
  stops.forEach((stop) => {
    const lineRe = new RegExp(`(?:^|\\n)\\s*${escapeReg(stop)}(?:\\s|$|[:：])`);
    const lineAt = next.search(lineRe);
    if (lineAt > 0) next = next.slice(0, lineAt).trim();
    const inlineRe = new RegExp(`\\s+${escapeReg(stop)}(?:\\s|$|[:：])`);
    const inlineAt = next.search(inlineRe);
    if (inlineAt > 0) next = next.slice(0, inlineAt).trim();
  });
  return next.trim();
}

/**
 * 去掉中文之间被 PDF 拆开的空格。
 * @param {string} value
 */
function tidyExtractedText(value: string): string {
  return String(value || "")
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([，。；、])/g, "$1")
    .trim();
}

/**
 * 文档里的「未填」占位不当作有效字段值。
 * @param {string} value
 */
function isPlaceholder(value: string): boolean {
  return /^(未填|暂无|无|空|—|-{1,3}|N\/A)$/i.test(String(value || "").trim());
}

/**
 * 是否把邻格/整章原文堆进了当前字段。
 * @param {string} value
 */
export function looksLikeDump(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/最后更新时间|产品简称|所属业务|产品负责人|知识ID|模块ID|字段 填写内容/.test(text)) return true;
  if (/[一二三四五六七八九十]、/.test(text) && text.length > 80) return true;
  if (text.length > 1200) return true;
  if ((text.match(/\n/g) || []).length > 12) return true;
  const labels = ["产品是什么", "产品服务谁", "核心场景", "核心价值", "对象名称", "基本关系"];
  return labels.filter((label) => text.includes(label)).length >= 2;
}

/**
 * 按字段语义收紧解析值：短字段一行，日期/版本只留对应值。
 * @param {string} value
 * @param {string} key
 * @param {FieldDef} [field]
 */
export function boundCellValue(value: string, key: string, field?: FieldDef): string {
  const skip = new Set([key, field?.label, key === "name" ? "名称" : "", key === "summary" ? "摘要" : ""].filter(Boolean) as string[]);
  let next = cutAtStops(
    String(value || "").trim(),
    CELL_STOPS.filter((stop) => !skip.has(stop)),
  );
  STOP_HEADINGS.forEach((heading) => {
    const cut = next.search(new RegExp(`(?:^|\\n)\\s*${escapeReg(heading)}`));
    if (cut >= 0) next = next.slice(0, cut).trim();
  });
  next = next.replace(/\n{3,}/g, "\n\n").trim();
  next = tidyExtractedText(next);
  if (!next || isPlaceholder(next)) return "";
  const kind = field?.type || (key === "name" || META_KEYS.has(key) ? "text" : "textarea");
  if (key === "name") {
    next = next.split(/\n/)[0].trim();
    if (next.length > 40) next = next.slice(0, 40).replace(/[，,、].*$/, "").trim();
    return next;
  }
  if (key === "source" && /\.(pdf|docx?|xlsx?|txt|md)$/i.test(next.split(/\s/)[0] || "")) {
    return "";
  }
  if (key === "effective_from" || key === "effective_to") {
    const hit = next.match(/长期有效|\d{4}-\d{1,2}-\d{1,2}/);
    return hit ? hit[0] : next.split(/\n/)[0].trim().slice(0, 32);
  }
  if (key === "source_version") {
    const hit = next.match(/V?\d+(?:\.\d+)*/i);
    if (hit && next.length > 16) return hit[0];
    return next.split(/\n/)[0].trim().slice(0, 24);
  }
  if (key === "target_users" && /[、，,]/.test(next) && !next.includes("\n")) {
    next = next
      .split(/[、，,]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n");
  }
  if (META_KEYS.has(key) || kind === "text" || kind === "select") {
    next = next.split(/\n/)[0].trim();
    return next.length > 80 ? next.slice(0, 80).trim() : next;
  }
  const lines = next
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  next = lines.join("\n");
  if (next.length > 280) next = next.slice(0, 280).replace(/\s+\S*$/, "").trim();
  return next;
}

/**
 * 去掉堆砌原文，只保留能当字段值的短内容。
 * @param {KnowledgeType} type
 * @param {Record<string, string>} parsed
 */
function sanitizeParsed(type: KnowledgeType, parsed: Record<string, string>): Record<string, string> {
  const fields = Object.fromEntries(usableFields(type).map((field) => [field.key, field]));
  const out: Record<string, string> = {};
  Object.entries(parsed).forEach(([key, raw]) => {
    const field = fields[key];
    const value = boundCellValue(raw, key, field);
    if (!value || isAssistantPreamble(value) || looksLikeDump(value)) return;
    out[key] = value;
  });
  return out;
}

/**
 * 本类型里适合用来定位章节的标签，不含各类型共用的来源/时间。
 * @param {KnowledgeType} type
 */
function distinctiveNeedles(type: KnowledgeType): string[] {
  const labels = usableFields(type)
    .filter((field) => !META_KEYS.has(field.key) && String(field.label || "").length >= 2)
    .map((field) => field.label);
  return [type.name, ...labels].filter(Boolean);
}

/**
 * 按字段标签对齐。支持「标签：内容」和 PDF 表格「标签 内容」（无冒号）。
 * @param {KnowledgeType} type
 * @param {string} text
 */
export function parseLabeledKnowledge(type: KnowledgeType, text: string): Record<string, string> {
  const source = String(text || "").replace(/\r\n/g, "\n");
  if (!source.trim()) return {};
  const entries = labelEntries(type);
  const labels = entries.map((item) => item.label);
  const hits: { key: string; start: number; valueStart: number; label: string; exact: boolean }[] = [];
  entries.forEach((entry) => {
    const re = new RegExp(`(?:^|\\n)\\s*${escapeReg(entry.label)}(?:\\s*[:：]\\s*|\\s+|(?=[^\\s:：\\n]))`, "g");
    let match: RegExpExecArray | null = re.exec(source);
    while (match) {
      const labelAt = match.index + match[0].indexOf(entry.label);
      if (!isShorterAlias(source, labelAt, entry.label, labels)) {
        const primary = usableFields(type).find((field) => field.key === entry.key)?.label || entry.key;
        hits.push({
          key: entry.key,
          label: entry.label,
          start: match.index,
          valueStart: match.index + match[0].length,
          exact: entry.label === primary || entry.label === "名称" || entry.label === "摘要",
        });
      }
      match = re.exec(source);
    }
  });
  hits.sort((a, b) => a.valueStart - b.valueStart || b.label.length - a.label.length);
  const picked: typeof hits = [];
  const seenPos = new Set<number>();
  hits.forEach((hit) => {
    if (seenPos.has(hit.valueStart)) return;
    seenPos.add(hit.valueStart);
    picked.push(hit);
  });
  picked.sort((a, b) => a.valueStart - b.valueStart);
  const out: Record<string, string> = {};
  picked.forEach((hit, index) => {
    if (out[hit.key] && !hit.exact) return;
    const rawEnd = index + 1 < picked.length ? picked[index + 1].start : source.length;
    const field = usableFields(type).find((item) => item.key === hit.key);
    const value = boundCellValue(source.slice(hit.valueStart, rawEnd), hit.key, field);
    if (value && !isAssistantPreamble(value) && !looksLikeDump(value)) out[hit.key] = value;
  });
  if (!out.name) {
    const named = source.match(/你是「([^」]+)」/) || source.match(/产品名称[：:\s]+([^\n]+)/);
    if (named?.[1] && !isAssistantPreamble(named[1])) {
      const product = boundCellValue(named[1].replace(/的产品知识助手$/, "").replace(/\s*APP$/i, "").trim(), "name");
      if (product) out.name = type.name && !product.includes(type.name) ? `${product}${type.name}` : product;
    }
  }
  if (!out.summary) {
    const fact =
      source.match(/产品定位与核心事实[：:]\s*\n?([^\n]+)/) ||
      source.match(/一句话定义[：:\s]*\n?([^\n]+)/);
    if (fact?.[1] && !isAssistantPreamble(fact[1])) {
      const summary = boundCellValue(fact[1].trim(), "summary");
      if (summary) out.summary = summary;
    }
  }
  return out;
}

/**
 * 从长文档里截出和当前对象类型最相关的一段，让模型分析的是这块内容而不是文件名。
 * @param {KnowledgeType} type
 * @param {string} text
 */
export function excerptForType(type: KnowledgeType, text: string): string {
  const body = String(text || "");
  if (body.length <= 4500) return body;
  const needles = distinctiveNeedles(type);
  const name = type.name || "";
  let bestAt = -1;
  let bestScore = -1;
  if (name.length >= 2) {
    const re = new RegExp(escapeReg(name), "g");
    let match: RegExpExecArray | null = re.exec(body);
    while (match) {
      const after = body.slice(match.index, match.index + 600);
      let score = 0;
      if (after.includes("名称") || after.includes("摘要")) score += 1;
      needles.forEach((needle) => {
        if (needle !== name && after.includes(needle)) score += 2;
      });
      const lineStart = body.lastIndexOf("\n", match.index);
      const lineEnd = body.indexOf("\n", match.index);
      const line = body.slice(lineStart >= 0 ? lineStart : 0, lineEnd >= 0 ? lineEnd : match.index + name.length);
      if (line.trim().length <= 40) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestAt = match.index;
      }
      match = re.exec(body);
    }
  }
  if (bestAt >= 0 && bestScore > 0) {
    const start = Math.max(0, bestAt - 24);
    return body.slice(start, start + 4500);
  }
  let at = -1;
  needles.forEach((needle) => {
    if (!needle || needle === name) return;
    const found = body.indexOf(needle);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  });
  if (at >= 0) return body.slice(Math.max(0, at - 80), at + 4200);
  return clipLlmText(body, 4500);
}

/**
 * 截到分析对话可用的正文长度；有助手开场白时从知识正文起。
 * @param {string} text
 * @param {number} [limit]
 */
export function clipLlmText(text: string, limit = 4500): string {
  let value = String(text || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  if (isAssistantPreamble(value.split("\n")[0] || "")) {
    const markers = ["产品定位与核心事实", "产品是什么", "产品简介", "名称："];
    let sliced = "";
    for (const marker of markers) {
      const at = value.indexOf(marker);
      if (at >= 0) {
        sliced = value.slice(at);
        break;
      }
    }
    if (!sliced) {
      const lines = value.split("\n");
      const start = lines.findIndex((line) => line.trim() && !isAssistantPreamble(line));
      sliced = start >= 0 ? lines.slice(start).join("\n") : value;
    }
    value = sliced;
  }
  if (value.length <= limit) return value;
  const head = Math.floor(limit * 0.75);
  const tail = limit - head - 8;
  return `${value.slice(0, head)}\n…\n${value.slice(-Math.max(tail, 80))}`;
}

/**
 * 提示词里的字段说明。
 * @param {FieldDef} field
 */
function fieldLine(field: FieldDef): string {
  const hint = field.fill_hint ? `（${String(field.fill_hint).slice(0, 24)}）` : "";
  return `${field.key}=${field.label || field.key}${hint}`;
}

/**
 * 列出当前仍空的字段。必填业务字段优先，元数据最后，避免模型只填来源文件名。
 * @param {KnowledgeType} type
 * @param {{ name?: string, summary?: string, payload?: Record<string, string> }} current
 */
export function emptyFieldLines(
  type: KnowledgeType,
  current: { name?: string; summary?: string; payload?: Record<string, string> },
): string[] {
  const payload = asPayload(current.payload);
  const required: string[] = [];
  const optional: string[] = [];
  const meta: string[] = [];
  if (!String(current.name || "").trim()) required.push("name=名称");
  if (!String(current.summary || "").trim()) required.push("summary=摘要");
  usableFields(type).forEach((field) => {
    if (String(payload[field.key] || "").trim()) return;
    const line = fieldLine(field);
    if (META_KEYS.has(field.key)) meta.push(line);
    else if (field.required) required.push(line);
    else optional.push(line);
  });
  return [...required, ...optional, ...meta];
}

/**
 * 从模型 JSON 或标签解析结果里取出某个字段。
 * @param {Record<string, string>} incoming
 * @param {string} key
 * @param {string} [label]
 */
function incomingValue(incoming: Record<string, string>, key: string, label?: string): string {
  return String(incoming[key] || incoming[label || ""] || "").trim();
}

/**
 * 接受模型输出：名称和元数据仍截断，正文不截成半句，但拒绝原文堆砌。
 * @param {string} value
 * @param {string} key
 * @param {FieldDef} [field]
 */
function acceptLlmValue(value: string, key: string, field?: FieldDef): string {
  let cleaned = String(value || "").trim();
  if (!cleaned || isPlaceholder(cleaned) || isAssistantPreamble(cleaned) || looksLikeDump(cleaned)) return "";
  if (key === "name" || META_KEYS.has(key) || field?.type === "text" || field?.type === "select") {
    cleaned = boundCellValue(cleaned, key, field);
  }
  if (!cleaned || looksLikeDump(cleaned)) return "";
  return cleaned;
}

/**
 * 已填若是邻格堆砌则视为空，方便后续改写覆盖。
 * @param {string} value
 */
function keepUserValue(value: string): string {
  const text = String(value || "").trim();
  if (!text || isPlaceholder(text) || looksLikeDump(text)) return "";
  return text;
}

/**
 * 把解析或模型结果合进当前表单。已填不覆盖，堆砌原文视为未填。
 * @param {KnowledgeType} type
 * @param {{ name?: string, summary?: string, payload?: Record<string, string> }} current
 * @param {Record<string, unknown>} data
 */
export function mergeFilled(
  type: KnowledgeType,
  current: { name?: string; summary?: string; payload?: Record<string, string> },
  data: Record<string, unknown>,
): { name: string; summary: string; payload: Record<string, string>; filled_keys: string[] } {
  const incoming = { ...asPayload(data.payload), ...asPayload(data) };
  const payload = { ...asPayload(current.payload) };
  const filled: string[] = [];
  let name = keepUserValue(current.name || "");
  const nextName = acceptLlmValue(incomingValue(incoming, "name", "名称"), "name");
  if (!name && nextName) {
    name = nextName;
    filled.push("name");
  }
  let summary = keepUserValue(current.summary || "");
  const nextSummary = acceptLlmValue(
    incomingValue(incoming, "summary", "摘要") || incomingValue(incoming, "summary", "产品简介"),
    "summary",
  );
  if (!summary && nextSummary) {
    summary = nextSummary;
    filled.push("summary");
  }
  usableFields(type).forEach((field) => {
    const existing = keepUserValue(payload[field.key] || "");
    payload[field.key] = existing;
    if (existing) return;
    const next = acceptLlmValue(incomingValue(incoming, field.key, field.label), field.key, field);
    if (!next) return;
    payload[field.key] = next;
    filled.push(field.key);
  });
  return { name, summary, payload, filled_keys: filled };
}

/**
 * 用模型改写结果覆盖业务字段；用户已填且非堆砌的不覆盖。
 * @param {KnowledgeType} type
 * @param {{ name?: string, summary?: string, payload?: Record<string, string> }} current
 * @param {Record<string, unknown>} data
 * @param {Set<string>} locked
 */
function mergeRewrite(
  type: KnowledgeType,
  current: { name?: string; summary?: string; payload?: Record<string, string> },
  data: Record<string, unknown>,
  locked: Set<string>,
): { name: string; summary: string; payload: Record<string, string>; filled_keys: string[] } {
  const incoming = { ...asPayload(data.payload), ...asPayload(data) };
  const payload = { ...asPayload(current.payload) };
  const filled: string[] = [];
  const nextName = acceptLlmValue(incomingValue(incoming, "name", "名称"), "name");
  let name = keepUserValue(current.name || "");
  if (nextName && !locked.has("name")) {
    name = nextName;
    filled.push("name");
  }
  const nextSummary = acceptLlmValue(
    incomingValue(incoming, "summary", "摘要") || incomingValue(incoming, "summary", "产品简介"),
    "summary",
  );
  let summary = keepUserValue(current.summary || "");
  if (nextSummary && !locked.has("summary")) {
    summary = nextSummary;
    filled.push("summary");
  }
  usableFields(type).forEach((field) => {
    if (locked.has(field.key)) return;
    const next = acceptLlmValue(incomingValue(incoming, field.key, field.label), field.key, field);
    if (!next) return;
    const existing = keepUserValue(payload[field.key] || "");
    if (META_KEYS.has(field.key) && existing) return;
    payload[field.key] = next;
    filled.push(field.key);
  });
  return { name, summary, payload, filled_keys: filled };
}

/**
 * 一次对话：文档 + 字段说明 → JSON。不把规则解析结果写入表单。
 * @param {KnowledgeType} type
 * @param {string} text
 * @param {{ name?: string, summary?: string, payload?: Record<string, string> }} current
 * @param {Set<string>} locked
 */
async function analyzeOnce(
  type: KnowledgeType,
  text: string,
  current: { name?: string; summary?: string; payload?: Record<string, string> },
  locked: Set<string>,
): Promise<{ name: string; summary: string; payload: Record<string, string>; filled_keys: string[] }> {
  const fields = [
    "name=名称。只写本条知识对象名称，不要夹带简称、所属业务、负责人。",
    "summary=摘要。1～2句归纳，不要粘贴原文。",
    ...usableFields(type).map((field) => {
      const hint = field.fill_hint ? String(field.fill_hint) : "";
      return `${field.key}=${field.label || field.key}。${hint}`.trim();
    }),
  ];
  const skip = locked.size ? `这些字段用户已填，JSON 里请省略：${[...locked].join("、")}。` : "";
  const prompt = [
    `请阅读下面的文档，为知识对象「${type.name}」填写字段。`,
    type.core_question ? `这类知识要回答：${type.core_question}` : "",
    "做法与平时对话相同：先理解文档，再按每个字段归纳、转写，必要时从上下文推断。",
    "每个字段必须是该字段自己的通顺中文，并按填写说明组织。禁止整段粘贴原文，禁止把邻格或其他章节写进本字段。",
    "失效时间无日期则写长期有效。所属模块没有则写产品整体。不要写模型名或对象类型名。",
    skip,
    "只输出一个 JSON 对象，key 如下：",
    fields.join("\n"),
    "文档：",
    clipLlmText(text, 2800),
  ]
    .filter(Boolean)
    .join("\n");
  const raw = await llmComplete(
    [
      { role: "system", content: "你是产品知识编辑。阅读文档后只输出 JSON，每个字段写有效语句，不要摘抄原文。" },
      { role: "user", content: prompt },
    ],
    800,
  );
  return mergeRewrite(type, current, extractLlmJson(raw) || {}, locked);
}

/**
 * 一轮补全仍空的字段。
 * @param {KnowledgeType} type
 * @param {string} text
 * @param {{ name?: string, summary?: string, payload?: Record<string, string> }} current
 */
async function fillOnce(
  type: KnowledgeType,
  text: string,
  current: { name?: string; summary?: string; payload?: Record<string, string> },
): Promise<{ name: string; summary: string; payload: Record<string, string>; filled_keys: string[] }> {
  const empty = emptyFieldLines(type, current).slice(0, 12);
  if (!empty.length) {
    return {
      name: String(current.name || ""),
      summary: String(current.summary || ""),
      payload: { ...asPayload(current.payload) },
      filled_keys: [],
    };
  }
  const prompt =
    `请阅读文档，为「${type.name}」填写这些空字段。归纳、转写，必要时推断；每个字段写通顺中文，禁止摘抄原文。` +
    (type.core_question ? `这类知识要回答：${type.core_question}。` : "") +
    "失效时间无日期则写长期有效；所属模块没有则写产品整体。不要写模型名、对象类型名。" +
    `只输出 JSON，key 必须是：${empty.join("；")}\n文档：\n${clipLlmText(text, 2200)}`;
  const raw = await llmComplete(
    [
      { role: "system", content: "阅读文档后只输出 JSON。空字段写成有效语句，不要摘抄原文。" },
      { role: "user", content: prompt },
    ],
    700,
  );
  return mergeFilled(type, current, extractLlmJson(raw) || {});
}

/**
 * 主路径：只让模型归纳填写。额度或配置异常时不按文档对齐，直接抛出原因。
 * @param {KnowledgeType} type
 * @param {string} text
 * @param {{ name?: string, summary?: string, payload?: Record<string, string> }} current
 */
export async function fillFieldsFromText(
  type: KnowledgeType,
  text: string,
  current: { name?: string; summary?: string; payload?: Record<string, string> },
): Promise<{
  name: string;
  summary: string;
  payload: Record<string, string>;
  filled_keys: string[];
  source: "document" | "mixed" | "model";
  warning?: string;
}> {
  const locked = new Set<string>();
  if (keepUserValue(current.name || "")) locked.add("name");
  if (keepUserValue(current.summary || "")) locked.add("summary");
  usableFields(type).forEach((field) => {
    if (keepUserValue(asPayload(current.payload)[field.key] || "")) locked.add(field.key);
  });
  if (isLlmQuotaBlocked()) {
    throw new Error(llmBlockedReason() || "大模型当前不可用。不会按文档对齐填写字段。请到知识治理中手工添加并编辑。");
  }
  const analysis = excerptForType(type, text);
  let next = {
    name: keepUserValue(current.name || ""),
    summary: keepUserValue(current.summary || ""),
    payload: { ...asPayload(current.payload) },
    filled_keys: [] as string[],
  };
  usableFields(type).forEach((field) => {
    next.payload[field.key] = keepUserValue(next.payload[field.key] || "");
  });
  const all: string[] = [];
  try {
    const analyzed = await analyzeOnce(type, analysis, next, locked);
    if (analyzed.filled_keys.length) {
      all.push(...analyzed.filled_keys);
      next = { ...analyzed, filled_keys: all };
    }
    if (emptyFieldLines(type, next).length) {
      const round = await fillOnce(type, analysis, next);
      if (round.filled_keys.length) {
        all.push(...round.filled_keys);
        next = { ...round, filled_keys: all };
      }
    }
  } catch (err) {
    if (isLlmUnavailableError(err)) {
      markLlmUnavailable(err);
      if (!all.length) throw new Error(llmUnavailableReason(err));
    } else {
      throw err;
    }
  }
  const hasValue = Boolean(
    keepUserValue(next.name) ||
      keepUserValue(next.summary) ||
      usableFields(type).some((field) => keepUserValue(next.payload[field.key] || "")),
  );
  if (!hasValue) {
    throw new Error("模型没有返回可写入的字段。不会按文档对齐填写。请检查大模型配置后重试，或到知识治理中手工添加并编辑。");
  }
  return { ...next, filled_keys: all, source: "model" };
}

/**
 * 按一个对象类型抽出一条实例（尚未标冲突）。
 * @param {KnowledgeType} type
 * @param {string} text
 */
export async function extractTypeInstance(type: KnowledgeType, text: string): Promise<Record<string, unknown>> {
  const filled = await fillFieldsFromText(type, text, { name: "", summary: "", payload: {} });
  const hasValue =
    Boolean(filled.name || filled.summary) ||
    Object.values(filled.payload || {}).some((value) => String(value || "").trim());
  if (!hasValue) {
    throw new Error("没有从文档中抽出可写入的字段。");
  }
  return {
    type_id: type.entity_id,
    type_name: type.name,
    model_code: type.model_code,
    model_name: type.model_name,
    name: filled.name,
    summary: filled.summary,
    payload: filled.payload,
    tags: [],
    warning: filled.warning || "",
    confidence: Object.keys(filled.payload).length ? 1 : 0,
  };
}

/**
 * 给抽出的实例标新建/覆盖。
 * @param {Record<string, unknown>[]} instances
 * @param {number} [bindEntityId]
 */
export async function annotateExtracted(
  instances: Record<string, unknown>[],
  bindEntityId?: number,
): Promise<Record<string, unknown>[]> {
  if (!instances.length) return [];
  try {
    const res = await api.post(
      "/api/extract/annotate",
      jsonPayload({
        instances,
        bind_entity_id: bindEntityId,
      }),
    );
    const rows = asList<Record<string, unknown>>((res.data as { instances?: unknown })?.instances ?? res.data);
    return rows.length ? rows : instances;
  } catch {
    return instances.map((item) => ({ ...item, write_action: item.write_action || "create" }));
  }
}

/**
 * 按一级模型挑一个对象类型。
 * @param {number} modelCode
 * @param {KnowledgeType[]} types
 * @param {{ type_hits?: { type_id?: string }[] } | null} scan
 */
export function typeForModel(
  modelCode: number,
  types: KnowledgeType[],
  scan?: { type_hits?: { type_id?: string }[] } | null,
): KnowledgeType | undefined {
  const hits = scan?.type_hits || [];
  for (const hit of hits) {
    const found = types.find((item) => item.entity_id === hit.type_id && item.model_code === modelCode);
    if (found) return found;
  }
  return types.find((item) => item.model_code === modelCode);
}

/**
 * 文档对某类型的命中分：出现类型名、字段标题则更高，避免总览页只抽到空壳类型。
 * @param {KnowledgeType} type
 * @param {string} text
 */
export function typeMentionScore(type: KnowledgeType, text: string): number {
  const body = String(text || "");
  if (!body) return 0;
  let score = 0;
  if (type.name && body.includes(type.name)) score += 4;
  (type.fields || []).forEach((field) => {
    const label = field.label || "";
    if (label.length < 3 || META_KEYS.has(field.key) || !body.includes(label)) return;
    score += field.required ? 3 : 1;
  });
  return score;
}

/**
 * 每个一级模型选文档真正覆盖的对象类型，而不是固定第一个。
 * @param {number} modelCode
 * @param {KnowledgeType[]} types
 * @param {string} text
 * @param {{ type_hits?: { type_id?: string }[] } | null} [scan]
 * @param {number} [limit]
 */
export function typesForModel(
  modelCode: number,
  types: KnowledgeType[],
  text: string,
  scan?: { type_hits?: { type_id?: string }[] } | null,
  limit = 2,
): KnowledgeType[] {
  const ofModel = types.filter((item) => item.model_code === modelCode);
  const ranked = [...ofModel].sort((a, b) => typeMentionScore(b, text) - typeMentionScore(a, text));
  const matched = ranked.filter((item) => typeMentionScore(item, text) > 0).slice(0, limit);
  if (matched.length) return matched;
  const fallback = typeForModel(modelCode, types, scan);
  return fallback ? [fallback] : ofModel.slice(0, 1);
}

/**
 * 取来源正文；列表项若没带 content 再拉详情。
 * @param {{ id?: number, content?: string }} source
 */
export async function sourceText(source: { id?: number; content?: string }): Promise<string> {
  const local = String(source.content || "").trim();
  if (local) return local;
  if (!source.id) return "";
  const res = await api.get(`/api/sources/${source.id}`);
  return String((res.data as { content?: string })?.content || "").trim();
}
