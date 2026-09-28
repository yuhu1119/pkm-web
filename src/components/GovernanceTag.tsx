import { Tag, Tooltip } from "antd";

export const GOVERNANCE_META: Record<string, { label: string; color: string; fill: string; desc: string }> = {
  ungoverned: { label: "未治理", color: "default", fill: "#fafafa", desc: "尚未挂来源，也没有结构化实例" },
  sourced: { label: "已挂来源", color: "processing", fill: "#e6f4ff", desc: "已关联在线文档或本地文件，尚未抽取或未进入治理" },
  extracted: { label: "已抽取待治理", color: "cyan", fill: "#e6fffb", desc: "智能抽取已完成，待人工确认并发布" },
  incomplete: { label: "结构不完整", color: "warning", fill: "#fffbe6", desc: "已进入治理，但必填字段无效或不完整" },
  governed: { label: "已治理", color: "success", fill: "#f6ffed", desc: "必填字段有效完整且已发布" },
};

/**
 * 治理阶段标签。
 */
export default function GovernanceTag({ stage, completeness }: { stage?: string; completeness?: number }) {
  const meta = GOVERNANCE_META[stage || "ungoverned"] || GOVERNANCE_META.ungoverned;
  return (
    <Tooltip title={meta.desc}>
      <Tag color={meta.color}>
        {meta.label}
        {typeof completeness === "number" && stage && stage !== "ungoverned" ? ` ${completeness}%` : ""}
      </Tag>
    </Tooltip>
  );
}
