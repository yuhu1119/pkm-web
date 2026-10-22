import { Alert, Button, Modal, Space, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api, apiErrorDetail, asList, Entity, KnowledgeType, parseEntityDetail } from "../api";
import { CompareAction, snapshotFromEntity, snapshotFromExtract } from "../knowledgeCompare";
import KnowledgeCompare from "./KnowledgeCompare";

interface ExtractRow {
  type_id: string;
  name: string;
  summary?: string;
  payload?: Record<string, string>;
  tags?: string[];
  evidence?: string;
  matched_id?: number;
  similar?: { id: number; name: string }[];
  write_action?: string;
  contradictions?: { key: string; label?: string; existing?: string; incoming?: string; note?: string }[];
}

interface Props {
  open: boolean;
  row?: ExtractRow | null;
  sourceId?: number;
  sourceIds?: number[];
  incremental?: boolean;
  onClose: () => void;
  onDone?: () => void;
  onMergeAlias?: () => void;
  onCreateNew?: () => void;
}

/**
 * AI 抽取结果与已有知识的对照写入，确认后走 extract/commit。
 */
export default function ExtractCompareModal({
  open,
  row,
  sourceId,
  sourceIds,
  incremental,
  onClose,
  onDone,
  onMergeAlias,
  onCreateNew,
}: Props) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [typeMeta, setTypeMeta] = useState<KnowledgeType | null>(null);
  const [applying, setApplying] = useState(false);
  const entityId = row?.matched_id || row?.similar?.[0]?.id;

  useEffect(() => {
    if (!open || !entityId) {
      setEntity(null);
      setTypeMeta(null);
      return;
    }
    api.get(`/api/entities/${entityId}`).then(async (res) => {
      const parsed = parseEntityDetail(res.data);
      setEntity(parsed.entity);
      if (parsed.type?.fields?.length) {
        setTypeMeta(parsed.type);
        return;
      }
      if (parsed.entity) {
        const types = await api.get("/api/meta/types");
        setTypeMeta(asList<KnowledgeType>(types.data).find((item) => item.entity_id === parsed.entity?.type_id) || null);
      }
    });
  }, [open, entityId]);

  const current = useMemo(() => (entity ? snapshotFromEntity(entity) : null), [entity]);
  const proposed = useMemo(() => (row && typeMeta ? snapshotFromExtract(row, typeMeta) : null), [row, typeMeta]);

  /**
   * 按对照结果通过 commit 更新已有实例并挂来源。
   * @param {ReturnType<typeof snapshotFromEntity>} merged
   * @param {string} note
   * @param {CompareAction} action
   */
  const apply = async (merged: ReturnType<typeof snapshotFromEntity>, note: string, action: CompareAction) => {
    if (!entity || !typeMeta) return;
    const bindIds = [...new Set([...(sourceIds || []), ...(sourceId ? [sourceId] : [])])];
    if (!bindIds.length) {
      message.warning("没有可挂载的文档");
      return;
    }
    setApplying(true);
    try {
      const res = await api.post("/api/extract/commit", {
        source_id: bindIds[0],
        source_ids: bindIds,
        incremental: incremental !== false,
        instances: [
          {
            type_id: typeMeta.entity_id,
            name: merged.name,
            summary: merged.summary,
            payload: merged.payload,
            tags: merged.tags,
            matched_id: entity.id,
            evidence: row?.evidence || note,
            change_note: note,
            conflict_action: action === "overwrite" ? "overwrite" : "update",
          },
        ],
      });
      if (!(res.data.updated || res.data.overwrites?.length)) {
        message.info((res.data.skipped || [])[0]?.reason || "没有写入变更");
        return;
      }
      message.success("已按对照结果更新，并写入版本");
      window.dispatchEvent(new Event("pkm-refresh"));
      onDone?.();
      onClose();
    } catch (err) {
      message.error(apiErrorDetail(err, "更新失败"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      title={entity ? `比较更新 · ${entity.type_id} / ${entity.name}` : "比较更新"}
      open={open}
      onCancel={onClose}
      footer={null}
      width={980}
      destroyOnClose
      maskClosable={false}
    >
      {entity && typeMeta && current && proposed ? (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {(row?.contradictions || []).length ? (
            <Alert
              type="warning"
              showIcon
              message="字段口径有矛盾，请逐项确认留谁"
              description={(row?.contradictions || [])
                .map((item) => `${item.label || item.key}：${item.existing || "空"} → ${item.incoming || "空"}`)
                .join("；")}
            />
          ) : null}
          {row?.write_action === "possible_alias" ? (
            <Space>
              {onMergeAlias ? <Button onClick={onMergeAlias}>合并为别名（保留「{entity.name}」）</Button> : null}
              {onCreateNew ? <Button onClick={onCreateNew}>仍是新实例</Button> : null}
            </Space>
          ) : null}
          <KnowledgeCompare
            typeMeta={typeMeta}
            current={current}
            proposed={proposed}
            mode="review"
            leftTitle="现有已保存"
            rightTitle="AI 识别结果"
            locked={!!entity.locked}
            published={entity.status === "published"}
            evidence={row?.evidence}
            applying={applying}
            onApply={apply}
            onKeep={onClose}
            contradictions={row?.contradictions}
          />
        </Space>
      ) : (
        <div className="pkm-muted">正在读取现有知识…</div>
      )}
    </Modal>
  );
}
