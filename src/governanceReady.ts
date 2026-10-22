import type { KnowledgeType } from "./api";

const PLACEHOLDERS = new Set(["", "-", "—", "n/a", "na", "待填写", "（填写）", "(填写)", "示例", "请填写", "tbd", "null"]);

/**
 * 字段是否算有效填写，规则与后端治理检查一致。
 * @param {unknown} value
 * @param {boolean} [required]
 * @param {number} [minLen]
 */
export function isEffectiveText(value: unknown, required = false, minLen = 2) {
  let text = "";
  if (Array.isArray(value)) {
    text = value
      .map((row) => (row && typeof row === "object" ? Object.values(row).join("") : String(row ?? "")))
      .join("")
      .trim();
  } else if (value && typeof value === "object") {
    text = Object.values(value).join("").trim();
  } else {
    text = String(value ?? "").trim();
  }
  const lower = text.toLowerCase();
  if (!text || PLACEHOLDERS.has(text) || PLACEHOLDERS.has(lower)) return !required;
  if (required && text.length < minLen) return false;
  return true;
}

export interface GovernanceGap {
  ready: boolean;
  missing: string[];
  hint: string;
}

/**
 * 对照当前表单判断能否点击「治理」。
 * @param {KnowledgeType | null | undefined} typeMeta
 * @param {Record<string, unknown>} values
 */
export function governanceGaps(typeMeta: KnowledgeType | null | undefined, values: Record<string, unknown>): GovernanceGap {
  const missing: string[] = [];
  const name = String(values.name ?? "").trim();
  if (!isEffectiveText(name, true, 2) || (typeMeta && name === typeMeta.entity_id)) {
    missing.push("实例名称");
  }
  for (const field of typeMeta?.fields || []) {
    if (!field.required || ["steward_name", "steward_role", "steward_team"].includes(field.key)) continue;
    const minLen = field.type === "textarea" || field.type === "table" ? 4 : 2;
    if (!isEffectiveText(values[field.key], true, minLen)) missing.push(field.label);
  }
  const hint = missing.length ? `内容不完整，还缺：${missing.join("、")}` : "";
  return { ready: missing.length === 0, missing, hint };
}
