import { Alert, Button, Input, Popconfirm, Radio, Select, Space, Tag } from "antd";
import FieldTableInput from "./FieldTableInput";
import { useEffect, useMemo, useState } from "react";
import type { KnowledgeType } from "../api";
import {
  CompareAction,
  FieldDecision,
  KnowledgeSnapshot,
  buildCompareRows,
  defaultDecisions,
  mergeSnapshot,
  patchSnapshot,
} from "../knowledgeCompare";

interface Props {
  typeMeta: KnowledgeType;
  current: KnowledgeSnapshot;
  proposed: KnowledgeSnapshot;
  mode: "review" | "edit";
  leftTitle?: string;
  rightTitle?: string;
  locked?: boolean;
  published?: boolean;
  evidence?: string;
  applying?: boolean;
  /** 为真时不渲染底部确认按钮，由外层保存 / 治理接管。 */
  hideActions?: boolean;
  onProposedChange?: (next: KnowledgeSnapshot) => void;
  onApply: (merged: KnowledgeSnapshot, note: string, action: CompareAction) => void;
  onKeep: () => void;
  contradictions?: { key: string; label?: string }[];
}

/**
 * 知识左右对照：左边现有已保存内容，右边本次修改或 AI 识别结果。
 */
export default function KnowledgeCompare({
  typeMeta,
  current,
  proposed,
  mode,
  leftTitle = "现有知识",
  rightTitle = "本次修改",
  locked,
  published,
  evidence,
  applying,
  hideActions,
  onProposedChange,
  onApply,
  onKeep,
  contradictions,
}: Props) {
  const rows = useMemo(() => buildCompareRows(typeMeta, current, proposed), [typeMeta, current, proposed]);
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    setDecisions(defaultDecisions(rows));
  }, [rows]);

  const changed = rows.filter((row) => row.changed);
  const takeCount = changed.filter((row) => decisions[row.key] === "take").length;

  /**
   * 提交对照结果。
   * @param {CompareAction} action
   */
  const submit = (action: CompareAction) => {
    const merged = mergeSnapshot(typeMeta, current, proposed, decisions, action);
    const label = action === "overwrite" ? "比较后全部覆盖" : `比较后确认变更 ${takeCount} 项`;
    onApply(merged, note.trim() || label, action);
  };

  return (
    <div className="pkm-compare">
      <div className="pkm-compare-head">
        <div>
          <span>{leftTitle}</span>
          <strong>已保存</strong>
        </div>
        <div className="pkm-compare-head-mid">对照</div>
        <div>
          <span>{rightTitle}</span>
          <strong>{mode === "edit" ? "正在修改" : "待确认"}</strong>
        </div>
      </div>
      {locked ? (
        <Alert type="warning" showIcon message="该实例已锁定，只能查看对照，不能写入。" />
      ) : changed.length ? (
        <Alert
          type="info"
          showIcon
          message={`有 ${changed.length} 个字段不一样`}
          description="逐项选择「保留现有」或「采用右侧」。右侧为空时默认保留现有，避免把已填内容冲掉。确认变更只写入采用项；全部覆盖则以右侧整体替换，包括空值。"
        />
      ) : (
        <Alert type="success" showIcon message="两侧内容一致，没有需要写入的差异。" />
      )}
      {evidence ? <div className="pkm-muted">原文依据：{evidence}</div> : null}
      <div className="pkm-compare-list">
        {rows.map((row) => (
          <div key={row.key} className={`pkm-compare-row${row.changed ? " changed" : ""}`}>
            <div className="pkm-compare-label">
              {row.label}
              {row.required ? <em>必填</em> : null}
              {contradictions?.some((item) => item.key === row.key) ? <Tag color="red">矛盾</Tag> : null}
              {row.blankIncoming ? <Tag>右侧为空，默认保留</Tag> : row.changed ? <Tag color="gold">有差异</Tag> : <Tag>相同</Tag>}
            </div>
            <div className="pkm-compare-cols">
              <div className="pkm-compare-cell">{row.current || <i>空</i>}</div>
              <div className="pkm-compare-action">
                {mode === "review" && row.changed && !locked ? (
                  <Radio.Group
                    size="small"
                    value={decisions[row.key] || "take"}
                    onChange={(e) => setDecisions((prev) => ({ ...prev, [row.key]: e.target.value }))}
                  >
                    <Radio.Button value="keep">保留</Radio.Button>
                    <Radio.Button value="take">采用</Radio.Button>
                  </Radio.Group>
                ) : mode === "edit" && row.changed ? (
                  <Button
                    size="small"
                    onClick={() =>
                      onProposedChange?.(
                        patchSnapshot(proposed, row.key, row.key === "tags" ? (current.tags || []).join("、") : row.current),
                      )
                    }
                  >
                    恢复现有
                  </Button>
                ) : (
                  <span className="pkm-muted">{row.changed ? "—" : "无变化"}</span>
                )}
              </div>
              <div className="pkm-compare-cell right">
                {mode === "edit" && !locked ? (
                  row.type === "select" ? (
                    <Select
                      allowClear
                      value={row.proposed || undefined}
                      options={(row.options || []).map((item) => ({ label: item, value: item }))}
                      onChange={(value) => onProposedChange?.(patchSnapshot(proposed, row.key, value || ""))}
                      style={{ width: "100%" }}
                    />
                  ) : row.type === "text" ? (
                    <Input
                      value={row.proposed}
                      onChange={(e) => onProposedChange?.(patchSnapshot(proposed, row.key, e.target.value))}
                    />
                  ) : row.type === "table" ? (
                    <FieldTableInput
                      value={row.proposed}
                      columns={row.options || []}
                      onChange={(value) => onProposedChange?.(patchSnapshot(proposed, row.key, value))}
                    />
                  ) : (
                    <Input.TextArea
                      rows={row.key === "name" ? 1 : 3}
                      value={row.proposed}
                      onChange={(e) => onProposedChange?.(patchSnapshot(proposed, row.key, e.target.value))}
                    />
                  )
                ) : (
                  row.proposed || <i>空</i>
                )}
              </div>
            </div>
            {row.fill_hint ? <div className="pkm-compare-hint">{row.fill_hint}</div> : null}
          </div>
        ))}
      </div>
      {hideActions ? null : (
        <>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="变更说明，将写入版本历史"
            disabled={locked}
          />
          <Space wrap>
            <Button onClick={onKeep}>保留现有</Button>
            {locked ? null : (
              <>
                <Button disabled={!takeCount && mode === "review"} loading={applying} onClick={() => submit("confirm")}>
                  确认变更{takeCount ? ` ${takeCount} 项` : ""}
                </Button>
                {published ? (
                  <Popconfirm title="已发布知识将被右侧内容整体替换，并写入新版本。确认覆盖？" onConfirm={() => submit("overwrite")}>
                    <Button danger loading={applying}>
                      全部覆盖
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button danger loading={applying} onClick={() => submit("overwrite")}>
                    全部覆盖
                  </Button>
                )}
              </>
            )}
          </Space>
        </>
      )}
    </div>
  );
}
