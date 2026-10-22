import type { Entity, KnowledgeType } from "./api";
import { asPayload } from "./api";

export type FieldDecision = "keep" | "take";
export type CompareAction = "confirm" | "overwrite";

export interface KnowledgeSnapshot {
  name: string;
  summary: string;
  payload: Record<string, string>;
  tags: string[];
  status?: string;
}

export interface CompareRow {
  key: string;
  label: string;
  current: string;
  proposed: string;
  changed: boolean;
  blankIncoming?: boolean;
  type?: string;
  required?: boolean;
  options?: string[];
  fill_hint?: string;
}

const STEWARD_KEYS = ["steward_name", "steward_role", "steward_team"];

/**
 * 把任意值收成可比较的文本。
 * @param {unknown} value
 */
export function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join("、");
  return String(value ?? "").trim();
}

/**
 * 从已保存实例取出对照快照。
 * @param {Entity} entity
 */
export function snapshotFromEntity(entity: Pick<Entity, "name" | "summary" | "payload" | "tags" | "status">): KnowledgeSnapshot {
  return {
    name: entity.name || "",
    summary: entity.summary || "",
    payload: { ...asPayload(entity.payload) },
    tags: [...(entity.tags || [])],
    status: entity.status,
  };
}

/**
 * 从 AI 抽取结果取出对照快照。
 * @param {any} row
 * @param {KnowledgeType} typeMeta
 */
export function snapshotFromExtract(row: any, typeMeta: KnowledgeType): KnowledgeSnapshot {
  const payload: Record<string, string> = {};
  typeMeta.fields.forEach((field) => {
    if (STEWARD_KEYS.includes(field.key)) return;
    payload[field.key] = String(row?.payload?.[field.key] ?? "");
  });
  if (!typeMeta.fields.some((field) => field.key === "aliases")) {
    payload.aliases = String(row?.payload?.aliases ?? "");
  }
  return {
    name: String(row?.name || ""),
    summary: String(row?.summary || ""),
    payload,
    tags: Array.isArray(row?.tags) ? row.tags.map((item: string) => String(item)) : [],
  };
}

/**
 * 按对象类型展开可比较字段。
 * @param {KnowledgeType} typeMeta
 * @param {KnowledgeSnapshot} current
 * @param {KnowledgeSnapshot} proposed
 */
export function buildCompareRows(typeMeta: KnowledgeType, current: KnowledgeSnapshot, proposed: KnowledgeSnapshot): CompareRow[] {
  const rows: CompareRow[] = [
    {
      key: "name",
      label: "实例名称",
      current: current.name || "",
      proposed: proposed.name || "",
      changed: asText(current.name) !== asText(proposed.name),
      blankIncoming: !asText(proposed.name) && !!asText(current.name),
      type: "text",
      required: true,
    },
    {
      key: "summary",
      label: "摘要",
      current: current.summary || "",
      proposed: proposed.summary || "",
      changed: asText(current.summary) !== asText(proposed.summary),
      blankIncoming: !asText(proposed.summary) && !!asText(current.summary),
      type: "textarea",
    },
  ];
  typeMeta.fields.forEach((field) => {
    if (STEWARD_KEYS.includes(field.key)) return;
    const left = String(current.payload?.[field.key] ?? "");
    const right = String(proposed.payload?.[field.key] ?? "");
    rows.push({
      key: field.key,
      label: field.label,
      current: left,
      proposed: right,
      changed: asText(left) !== asText(right),
      blankIncoming: !asText(right) && !!asText(left),
      type: field.type,
      required: field.required,
      options: field.options,
      fill_hint: field.fill_hint,
    });
  });
  if (!typeMeta.fields.some((field) => field.key === "aliases")) {
    const left = String(current.payload?.aliases ?? "");
    const right = String(proposed.payload?.aliases ?? "");
    rows.push({
      key: "aliases",
      label: "别名",
      current: left,
      proposed: right,
      changed: asText(left) !== asText(right),
      blankIncoming: !asText(right) && !!asText(left),
      type: "text",
      fill_hint: "同一对象的其他叫法，顿号分隔",
    });
  }
  rows.push({
    key: "tags",
    label: "标签",
    current: (current.tags || []).join("、"),
    proposed: (proposed.tags || []).join("、"),
    changed: (current.tags || []).join("\n") !== (proposed.tags || []).join("\n"),
    blankIncoming: !(proposed.tags || []).length && !!(current.tags || []).length,
    type: "tags",
  });
  return rows;
}

/**
 * 有实质新内容的字段默认采用右侧；右侧为空则默认保留现有，避免空值覆盖。
 * @param {CompareRow[]} rows
 */
export function defaultDecisions(rows: CompareRow[]): Record<string, FieldDecision> {
  const map: Record<string, FieldDecision> = {};
  rows.forEach((row) => {
    if (!row.changed) map[row.key] = "keep";
    else if (row.blankIncoming) map[row.key] = "keep";
    else map[row.key] = "take";
  });
  return map;
}

/**
 * 按默认规则合并：采用非空差异，空白保留现有。
 * @param {KnowledgeType} typeMeta
 * @param {KnowledgeSnapshot} current
 * @param {KnowledgeSnapshot} proposed
 */
export function mergeNonBlank(typeMeta: KnowledgeType, current: KnowledgeSnapshot, proposed: KnowledgeSnapshot): KnowledgeSnapshot {
  const rows = buildCompareRows(typeMeta, current, proposed);
  return mergeSnapshot(typeMeta, current, proposed, defaultDecisions(rows), "confirm");
}

/**
 * 按字段决策合成最终快照。
 * @param {KnowledgeType} typeMeta
 * @param {KnowledgeSnapshot} current
 * @param {KnowledgeSnapshot} proposed
 * @param {Record<string, FieldDecision>} decisions
 * @param {CompareAction} action
 */
export function mergeSnapshot(
  typeMeta: KnowledgeType,
  current: KnowledgeSnapshot,
  proposed: KnowledgeSnapshot,
  decisions: Record<string, FieldDecision>,
  action: CompareAction,
): KnowledgeSnapshot {
  const takeAll = action === "overwrite";
  const pick = (key: string, left: string, right: string) => (takeAll || decisions[key] === "take" ? right : left);
  const payload: Record<string, string> = { ...current.payload };
  typeMeta.fields.forEach((field) => {
    if (STEWARD_KEYS.includes(field.key)) return;
    payload[field.key] = pick(field.key, String(current.payload?.[field.key] ?? ""), String(proposed.payload?.[field.key] ?? ""));
  });
  if (!typeMeta.fields.some((field) => field.key === "aliases")) {
    payload.aliases = pick("aliases", String(current.payload?.aliases ?? ""), String(proposed.payload?.aliases ?? ""));
  }
  const tags = takeAll || decisions.tags === "take" ? [...(proposed.tags || [])] : [...(current.tags || [])];
  return {
    name: pick("name", current.name, proposed.name),
    summary: pick("summary", current.summary, proposed.summary),
    payload,
    tags,
    status: current.status,
  };
}

/**
 * 把右侧输入写回快照。
 * @param {KnowledgeSnapshot} snapshot
 * @param {string} key
 * @param {string} value
 */
export function patchSnapshot(snapshot: KnowledgeSnapshot, key: string, value: string): KnowledgeSnapshot {
  if (key === "name") return { ...snapshot, name: value };
  if (key === "summary") return { ...snapshot, summary: value };
  if (key === "tags") {
    return { ...snapshot, tags: value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean) };
  }
  return { ...snapshot, payload: { ...snapshot.payload, [key]: value } };
}
