import { Alert, Button, Modal, Popconfirm, Space, Table, Tag, message } from "antd";
import ResizableDrawer from "./ResizableDrawer";
import { useEffect, useMemo, useState } from "react";
import { api, KnowledgeType } from "../api";
import { KnowledgeSnapshot, mergeNonBlank } from "../knowledgeCompare";
import KnowledgeCompare from "./KnowledgeCompare";

interface ImportPreview {
  creates?: ImportCreate[];
  updates?: ImportUpdate[];
  unchanged?: { entity_id: number; name: string; type_id: string; type_name?: string }[];
  skipped?: { name: string; type_id?: string; reason: string }[];
  create_count?: number;
  update_count?: number;
  unchanged_count?: number;
  skipped_count?: number;
}

interface ImportCreate extends KnowledgeSnapshot {
  type_id: string;
  type_name?: string;
  model_name?: string;
  steward_name?: string;
  steward_role?: string;
  steward_team?: string;
}

interface ImportUpdate {
  entity_id: number;
  type_id: string;
  type_name?: string;
  model_name?: string;
  name: string;
  status?: string;
  published?: boolean;
  current: KnowledgeSnapshot;
  proposed: KnowledgeSnapshot;
  changed_fields?: { key: string; label: string }[];
  blank_fields?: { key: string; label: string }[];
  change_count?: number;
}

interface Props {
  open: boolean;
  preview: ImportPreview | null;
  onClose: () => void;
  onApplied?: () => void;
}

/**
 * 导入对照台：新实例可直接写入，已有知识必须比较或批量确认非空差异。
 */
export default function ImportReviewDrawer({ open, preview, onClose, onApplied }: Props) {
  const [types, setTypes] = useState<KnowledgeType[]>([]);
  const [createKeys, setCreateKeys] = useState<string[]>([]);
  const [resolved, setResolved] = useState<Record<number, KnowledgeSnapshot>>({});
  const [compareRow, setCompareRow] = useState<ImportUpdate | null>(null);
  const [applying, setApplying] = useState(false);

  const creates = preview?.creates || [];
  const updates = preview?.updates || [];
  const typeMap = useMemo(() => Object.fromEntries(types.map((item) => [item.entity_id, item])), [types]);

  useEffect(() => {
    if (!open) return;
    api.get("/api/meta/types").then((res) => setTypes(res.data || []));
    setCreateKeys((preview?.creates || []).map((item) => `${item.type_id}::${item.name}`));
    setResolved({});
    setCompareRow(null);
  }, [open, preview]);

  /**
   * 按默认规则（非空差异采用右侧）批量确认更新项。
   */
  const resolveAll = () => {
    const next: Record<number, KnowledgeSnapshot> = { ...resolved };
    updates.forEach((row) => {
      const typeMeta = typeMap[row.type_id];
      if (!typeMeta) return;
      next[row.entity_id] = mergeNonBlank(typeMeta, row.current, row.proposed);
    });
    setResolved(next);
    message.success(`已按非空差异确认 ${updates.length} 条，请再写入`);
  };

  /**
   * 写入勾选的新建项和已确认的更新项。
   */
  const apply = async () => {
    const selectedCreates = creates.filter((item) => createKeys.includes(`${item.type_id}::${item.name}`));
    const selectedUpdates = updates
      .filter((row) => resolved[row.entity_id])
      .map((row) => {
        const snap = resolved[row.entity_id];
        return {
          entity_id: row.entity_id,
          name: snap.name,
          summary: snap.summary,
          payload: snap.payload,
          tags: snap.tags,
          change_note: "导入比较后更新",
        };
      });
    if (!selectedCreates.length && !selectedUpdates.length) {
      message.warning("请勾选要新建的实例，或先比较确认要更新的已有知识");
      return;
    }
    setApplying(true);
    try {
      const res = await api.post("/api/import/apply", { creates: selectedCreates, updates: selectedUpdates });
      message.success(`已写入：新建 ${res.data.created}，更新 ${res.data.updated}，跳过 ${res.data.skipped}`);
      window.dispatchEvent(new Event("pkm-refresh"));
      onApplied?.();
      onClose();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "写入失败");
    } finally {
      setApplying(false);
    }
  };

  const compareType = compareRow ? typeMap[compareRow.type_id] : null;

  return (
    <ResizableDrawer
      title="导入对照"
      open={open}
      onClose={onClose}
      width={920}
      minWidth={480}
      destroyOnClose
      maskClosable={false}
      keyboard={false}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={applying} onClick={apply}>
            写入 {createKeys.length} 条新建
            {Object.keys(resolved).length ? ` + ${Object.keys(resolved).length} 条更新` : ""}
          </Button>
        </Space>
      }
    >
      {preview ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message={`新建 ${preview.create_count || 0} · 需比较 ${preview.update_count || 0} · 无变化 ${preview.unchanged_count || 0} · 跳过 ${preview.skipped_count || 0}`}
            description="已有知识不会直接覆盖。请逐条比较，或批量确认非空差异。导入里的空单元格默认保留现有内容。"
          />
          {creates.length ? (
            <div>
              <div style={{ marginBottom: 8 }}>将新建</div>
              <Table
                rowKey={(row) => `${row.type_id}::${row.name}`}
                size="small"
                pagination={false}
                dataSource={creates}
                rowSelection={{
                  selectedRowKeys: createKeys,
                  onChange: (keys) => setCreateKeys(keys as string[]),
                }}
                columns={[
                  { title: "模型", dataIndex: "model_name", width: 120 },
                  { title: "对象类型", render: (_: unknown, row: ImportCreate) => `${row.type_id} ${row.type_name || ""}` },
                  { title: "实例", dataIndex: "name" },
                  { title: "摘要", dataIndex: "summary", ellipsis: true },
                ]}
              />
            </div>
          ) : null}
          {updates.length ? (
            <div>
              <Space style={{ marginBottom: 8 }}>
                <span>已有知识，需比较后更新</span>
                <Popconfirm title="对全部有差异项采用非空字段，空值保留现有。确认？" onConfirm={resolveAll}>
                  <Button size="small" disabled={!types.length}>
                    批量确认非空差异
                  </Button>
                </Popconfirm>
              </Space>
              <Table
                rowKey="entity_id"
                size="small"
                pagination={false}
                dataSource={updates}
                columns={[
                  { title: "对象类型", render: (_: unknown, row: ImportUpdate) => `${row.type_id} ${row.type_name || ""}` },
                  { title: "实例", dataIndex: "name" },
                  {
                    title: "差异",
                    render: (_: unknown, row: ImportUpdate) => (
                      <Space size={4} wrap>
                        <Tag color="gold">{row.change_count || 0} 项有新内容</Tag>
                        {row.blank_fields?.length ? <Tag>空值 {row.blank_fields.length}</Tag> : null}
                        {row.published ? <Tag color="blue">已发布</Tag> : null}
                        {resolved[row.entity_id] ? <Tag color="green">已确认</Tag> : null}
                      </Space>
                    ),
                  },
                  {
                    title: "操作",
                    width: 80,
                    align: "right",
                    className: "pkm-table-ops-cell",
                    render: (_: unknown, row: ImportUpdate) => (
                      <div className="pkm-table-ops">
                        <Button type="link" onClick={() => setCompareRow(row)}>
                          比较
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          ) : null}
          {(preview.unchanged || []).length ? (
            <div className="pkm-muted">与现有一致、无需更新：{(preview.unchanged || []).map((item) => item.name).join("、")}</div>
          ) : null}
          {(preview.skipped || []).length ? (
            <Alert
              type="warning"
              showIcon
              message="已跳过"
              description={(preview.skipped || []).map((item) => `${item.name}（${item.reason}）`).join("；")}
            />
          ) : null}
        </Space>
      ) : null}
      <Modal
        title={compareRow ? `比较更新 · ${compareRow.type_id} / ${compareRow.name}` : "比较更新"}
        open={!!compareRow}
        onCancel={() => setCompareRow(null)}
        footer={null}
        width={980}
        destroyOnClose
        maskClosable={false}
        keyboard={false}
      >
        {compareRow && compareType ? (
          <KnowledgeCompare
            typeMeta={compareType}
            current={compareRow.current}
            proposed={compareRow.proposed}
            mode="review"
            leftTitle="现有已保存"
            rightTitle="导入内容"
            published={!!compareRow.published}
            onApply={(merged) => {
              setResolved((prev) => ({ ...prev, [compareRow.entity_id]: merged }));
              setCompareRow(null);
              message.success("已记下对照结果，写入时再生效");
            }}
            onKeep={() => setCompareRow(null)}
          />
        ) : (
          <div className="pkm-muted">缺少对象类型定义，无法对照。</div>
        )}
      </Modal>
    </ResizableDrawer>
  );
}
