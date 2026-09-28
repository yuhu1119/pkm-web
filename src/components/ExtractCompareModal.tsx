import { Modal, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api, Entity, KnowledgeType } from "../api";
import { snapshotFromEntity, snapshotFromExtract } from "../knowledgeCompare";
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
}

interface Props {
  open: boolean;
  row?: ExtractRow | null;
  sourceId?: number;
  onClose: () => void;
  onDone?: () => void;
}

/**
 * AI 抽取结果与已有知识的对照写入。
 */
export default function ExtractCompareModal({ open, row, sourceId, onClose, onDone }: Props) {
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
    api.get(`/api/entities/${entityId}`).then((res) => {
      setEntity(res.data.entity);
      setTypeMeta(res.data.type);
    });
  }, [open, entityId]);

  const current = useMemo(() => (entity ? snapshotFromEntity(entity) : null), [entity]);
  const proposed = useMemo(() => (row && typeMeta ? snapshotFromExtract(row, typeMeta) : null), [row, typeMeta]);

  /**
   * 按对照结果更新已有实例，并挂上文档来源。
   */
  const apply = async (merged: ReturnType<typeof snapshotFromEntity>, note: string) => {
    if (!entity || !typeMeta) return;
    setApplying(true);
    try {
      await api.put(`/api/entities/${entity.id}`, {
        type_id: typeMeta.entity_id,
        name: merged.name,
        summary: merged.summary,
        status: entity.status,
        tags: merged.tags,
        payload: merged.payload,
        origin: entity.origin || "extract",
        refs: (entity.refs || []).filter((item) => item.to_id).map((item) => ({ to_id: item.to_id, relation: item.relation || "引用" })),
        change_note: note,
        steward_name: entity.steward_name || "",
        steward_role: entity.steward_role || "",
        steward_team: entity.steward_team || "",
      });
      if (sourceId) {
        await api.post(`/api/sources/${sourceId}/bind`, {
          entity_id: entity.id,
          excerpt: row?.evidence || "比较后更新",
        });
      }
      message.success("已按对照结果更新，并写入版本");
      window.dispatchEvent(new Event("pkm-refresh"));
      onDone?.();
      onClose();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "更新失败");
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
    >
      {entity && typeMeta && current && proposed ? (
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
        />
      ) : (
        <div className="pkm-muted">正在读取现有知识…</div>
      )}
    </Modal>
  );
}
