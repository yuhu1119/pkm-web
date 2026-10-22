import { Tag, Tooltip } from "antd";

export const GOVERNANCE_META: Record<string, { label: string; color: string; fill: string; desc: string }> = {
  ungoverned: { label: "未治理", color: "default", fill: "#F7F8FA", desc: "尚未挂来源，也没有有效内容" },
  sourced: { label: "已挂来源", color: "processing", fill: "#E8F3FF", desc: "已关联文档，但实例尚无有效内容" },
  extracted: { label: "已抽取待治理", color: "cyan", fill: "#E8F3FF", desc: "来自抽取，尚未形成有效内容" },
  incomplete: { label: "结构不完整", color: "warning", fill: "#FFF7E8", desc: "已有有效内容，但必填未齐或尚未发布" },
  governed: { label: "已治理", color: "success", fill: "#E8FFEA", desc: "必填字段有效完整且已发布" },
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
