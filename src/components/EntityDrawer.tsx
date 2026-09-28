import { Alert, Button, Card, Descriptions, Drawer, Form, Input, Modal, Popconfirm, Progress, Select, Space, Tag, Timeline, message } from "antd";
import { useEffect, useState } from "react";
import { api, Entity, KnowledgeType } from "../api";
import { useAuth } from "../auth";
import { KnowledgeSnapshot, snapshotFromEntity } from "../knowledgeCompare";
import type { EntityMode } from "../workspace";
import GovernanceTag from "./GovernanceTag";
import KnowledgeCompare from "./KnowledgeCompare";

const STEWARD_ROLES = ["产品经理", "架构师", "运营", "研发", "业务专家", "数据", "测试"];

interface Props {
  open: boolean;
  mode: EntityMode;
  id?: number;
  typeId?: string;
  onClose: () => void;
  onModeChange: (mode: EntityMode) => void;
  onOpenSource?: (typeId: string, entityId?: number) => void;
}

/**
 * 知识实例抽屉：已有知识的二次编辑必须左右对照后确认。
 */
export default function EntityDrawer({ open, mode, id, typeId, onClose, onModeChange, onOpenSource }: Props) {
  const [form] = Form.useForm();
  const { user } = useAuth();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [typeMeta, setTypeMeta] = useState<KnowledgeType | null>(null);
  const [impact, setImpact] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [refOptions, setRefOptions] = useState<Entity[]>([]);
  const [saved, setSaved] = useState<KnowledgeSnapshot | null>(null);
  const [proposed, setProposed] = useState<KnowledgeSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any | null>(null);
  const isCreate = mode === "create";
  const isEdit = mode === "edit" || mode === "create";
  const frozen = !!(entity?.locked);
  const canEdit = isEdit && !frozen;

  /**
   * 重新读取实例、类型与版本。
   */
  const loadEntity = async (entityId: number) => {
    const res = await api.get(`/api/entities/${entityId}`);
    setEntity(res.data.entity);
    setTypeMeta(res.data.type);
    setImpact(res.data.impact);
    const snap = snapshotFromEntity(res.data.entity);
    setSaved(snap);
    setProposed(snap);
    form.setFieldsValue({
      status: res.data.entity.status,
      tags: res.data.entity.tags,
      refs: (res.data.entity.refs || []).filter((r: any) => r.to_id).map((r: any) => r.to_id),
      steward_name: res.data.entity.steward_name || "",
      steward_role: res.data.entity.steward_role || "",
      steward_team: res.data.entity.steward_team || "",
    });
    const ver = await api.get(`/api/entities/${entityId}/versions`);
    setVersions(ver.data);
  };

  useEffect(() => {
    if (!open) return;
    const boot = async () => {
      const refs = await api.get("/api/entities");
      setRefOptions(refs.data);
      if (!isCreate && id) {
        await loadEntity(id);
      } else if (typeId) {
        const types = await api.get("/api/meta/types");
        const type = types.data.find((t: KnowledgeType) => t.entity_id === typeId);
        setTypeMeta(type);
        setEntity(null);
        setSaved(null);
        setProposed(null);
        form.resetFields();
        form.setFieldsValue({
          status: "draft",
          tags: type?.tags || [],
          steward_name: user?.display_name || user?.username || "",
          steward_role: "产品经理",
          steward_team: "",
        });
        const impactRes = await api.get("/api/impact", { params: { type_id: typeId } });
        setImpact(impactRes.data);
      }
    };
    boot();
  }, [open, mode, id, typeId]);

  const title = typeMeta ? `${isCreate ? "新建" : isEdit ? "对照治理" : "查看"} · ${typeMeta.model_name} / ${typeMeta.name}` : "知识实例";
  const allowedRefs = refOptions.filter((e) => !typeMeta?.ref_type_ids?.length || typeMeta.ref_type_ids.includes(e.type_id));
  const missing = entity?.missing_fields || [];

  /**
   * 把对照结果写成新版本。
   * @param {KnowledgeSnapshot} merged
   * @param {string} note
   */
  const applyMerged = async (merged: KnowledgeSnapshot, note: string) => {
    if (!entity || !typeMeta) return;
    const extra = form.getFieldsValue();
    setSaving(true);
    try {
      const res = await api.put(`/api/entities/${entity.id}`, {
        type_id: typeMeta.entity_id,
        name: merged.name,
        summary: merged.summary,
        status: extra.status || entity.status,
        tags: merged.tags,
        payload: merged.payload,
        origin: entity.origin || "manual",
        refs: (extra.refs || []).map((to_id: number) => ({ to_id, relation: "引用" })),
        change_note: note,
        steward_name: extra.steward_name || "",
        steward_role: extra.steward_role || "",
        steward_team: extra.steward_team || "",
      });
      message.success(res.data.entity.stage === "governed" ? "已对照确认并治理" : "已对照确认并保存");
      window.dispatchEvent(new Event("pkm-refresh"));
      onClose();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      width={isCreate ? 720 : 1080}
      destroyOnClose
      extra={
        <Space>
          {entity && !isCreate ? (
            <Button
              onClick={async () => {
                const res = await api.post(`/api/entities/${entity.id}/lock`, { locked: !entity.locked });
                setEntity(res.data);
                message.success(entity.locked ? "已解锁" : "已锁定");
                window.dispatchEvent(new Event("pkm-refresh"));
              }}
            >
              {entity.locked ? "解锁" : "锁定"}
            </Button>
          ) : null}
          {typeMeta ? (
            <Button onClick={() => onOpenSource?.(typeMeta.entity_id, entity?.id)}>
              {entity?.id ? "上传文档填写本实例" : "从文档写入"}
            </Button>
          ) : null}
        </Space>
      }
    >
      {entity && (
        <div className="pkm-drawer-status">
          <Space wrap>
            <GovernanceTag stage={entity.stage} completeness={entity.completeness} />
            {entity.origin === "extract" && <Tag>来自抽取</Tag>}
            {entity.has_source && <Tag color="blue">已挂来源</Tag>}
            {entity.locked && <Tag color="purple">已锁定</Tag>}
            <Tag>{entity.status === "published" ? "已发布" : entity.status === "deprecated" ? "已废弃" : "草稿"}</Tag>
            <Tag>v{entity.version}</Tag>
          </Space>
          <Progress
            percent={entity.completeness || 0}
            size="small"
            status={entity.stage === "governed" ? "success" : "active"}
            style={{ marginTop: 8, marginBottom: 0 }}
          />
          {missing.length ? (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              showIcon
              message="必填字段尚未有效填写"
              description={missing.map((f) => f.label).join("、")}
            />
          ) : entity.locked ? (
            <Alert style={{ marginTop: 12 }} type="warning" showIcon message="已锁定。后续文档解析不会覆盖本条，解锁后才能编辑。" />
          ) : entity.stage !== "governed" ? (
            <Alert style={{ marginTop: 12 }} type="info" showIcon message="字段已齐，发布后才计入已治理" />
          ) : null}
        </div>
      )}

      {isCreate && canEdit && typeMeta ? (
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            const payload: Record<string, string> = {};
            typeMeta.fields.forEach((f) => {
              if (["steward_name", "steward_role", "steward_team"].includes(f.key)) return;
              payload[f.key] = values[f.key] || "";
            });
            try {
              const res = await api.post("/api/entities", {
                type_id: typeMeta.entity_id,
                name: values.name,
                summary: values.summary,
                status: values.status,
                tags: values.tags || [],
                payload,
                origin: "manual",
                refs: (values.refs || []).map((to_id: number) => ({ to_id, relation: "引用" })),
                change_note: values.change_note || "创建",
                steward_name: values.steward_name || "",
                steward_role: values.steward_role || "",
                steward_team: values.steward_team || "",
              });
              message.success(res.data.entity.stage === "governed" ? "已治理入库" : "已保存，请补全有效字段并发布后才算已治理");
              window.dispatchEvent(new Event("pkm-refresh"));
              onClose();
            } catch (err: any) {
              message.error(err?.response?.data?.detail || "保存失败");
            }
          }}
        >
          <Form.Item name="name" label="实例名称" rules={[{ required: true, min: 2, message: "请填写有效名称" }]}>
            <Input placeholder="不要用对象编号或“待填写”占位" />
          </Form.Item>
          <Form.Item name="summary" label="摘要">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Card size="small" title="治理责任" style={{ marginBottom: 16 }} extra={<span className="pkm-muted">不写入知识正文，也不进入大模型语料</span>}>
            <Form.Item name="steward_name" label="维护人" rules={[{ required: true, message: "请填写维护人" }]}>
              <Input placeholder="具体负责人，可与创建人不同" />
            </Form.Item>
            <Form.Item name="steward_role" label="职责">
              <Select options={STEWARD_ROLES.map((item) => ({ label: item, value: item }))} />
            </Form.Item>
            <Form.Item name="steward_team" label="团队" style={{ marginBottom: 0 }}>
              <Input placeholder="如 家电家居产品部" />
            </Form.Item>
          </Card>
          {typeMeta.fields.map((field) => (
            <Form.Item
              key={field.key}
              name={field.key}
              label={field.label}
              extra={field.fill_hint}
              rules={field.required ? [{ required: true, min: 2, message: "请填写有效内容，不能只是占位" }] : []}
            >
              {field.type === "select" ? (
                <Select options={(field.options || []).map((o) => ({ label: o, value: o }))} allowClear />
              ) : field.type === "text" ? (
                <Input />
              ) : (
                <Input.TextArea rows={3} />
              )}
            </Form.Item>
          ))}
          <Form.Item name="refs" label="跨模型引用">
            <Select
              mode="multiple"
              allowClear
              optionFilterProp="label"
              options={allowedRefs.map((e) => ({ value: e.id, label: `${e.type_id} ${e.type_name} · ${e.name}` }))}
            />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" />
          </Form.Item>
          <Form.Item name="status" label="发布状态" extra="字段有效完整且选择已发布，才计入已治理">
            <Select
              options={[
                { value: "draft", label: "草稿（待治理）" },
                { value: "published", label: "已发布" },
                { value: "deprecated", label: "已废弃" },
              ]}
            />
          </Form.Item>
          <Form.Item name="change_note" label="变更说明">
            <Input />
          </Form.Item>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
          </Space>
        </Form>
      ) : null}

      {!isCreate && canEdit && typeMeta && saved && proposed ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <KnowledgeCompare
            typeMeta={typeMeta}
            current={saved}
            proposed={proposed}
            mode="edit"
            leftTitle="现有已保存"
            rightTitle="正在修改"
            locked={frozen}
            published={entity?.status === "published"}
            applying={saving}
            onProposedChange={setProposed}
            onApply={(merged, note) => applyMerged(merged, note)}
            onKeep={onClose}
          />
          <Form form={form} layout="vertical">
            <Card size="small" title="治理责任" extra={<span className="pkm-muted">不进入对照，也不进入语料</span>}>
              <Form.Item name="steward_name" label="维护人" rules={[{ required: true, message: "请填写维护人" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="steward_role" label="职责">
                <Select options={STEWARD_ROLES.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
              <Form.Item name="steward_team" label="团队" style={{ marginBottom: 0 }}>
                <Input />
              </Form.Item>
            </Card>
            <Form.Item name="refs" label="跨模型引用" style={{ marginTop: 16 }}>
              <Select
                mode="multiple"
                allowClear
                optionFilterProp="label"
                options={allowedRefs.map((e) => ({ value: e.id, label: `${e.type_id} ${e.type_name} · ${e.name}` }))}
              />
            </Form.Item>
            <Form.Item name="status" label="发布状态">
              <Select
                options={[
                  { value: "draft", label: "草稿（待治理）" },
                  { value: "published", label: "已发布" },
                  { value: "deprecated", label: "已废弃" },
                ]}
              />
            </Form.Item>
          </Form>
        </Space>
      ) : null}

      {!isCreate && !canEdit && entity && typeMeta ? (
        <>
          <Card size="small" title="治理责任" style={{ marginTop: 16 }} extra={<span className="pkm-muted">仅用于协作，不进入语料</span>}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="维护人">{entity.steward_name || "-"}</Descriptions.Item>
              <Descriptions.Item label="职责">{entity.steward_role || "-"}</Descriptions.Item>
              <Descriptions.Item label="团队">{entity.steward_team || "-"}</Descriptions.Item>
            </Descriptions>
          </Card>
          <Descriptions bordered size="small" column={1} style={{ marginTop: 16 }} title="知识内容">
            <Descriptions.Item label="摘要">{entity.summary || "-"}</Descriptions.Item>
            {typeMeta.fields.map((field) => (
              <Descriptions.Item key={field.key} label={field.label}>
                {entity.payload?.[field.key] || <span className="pkm-empty">未有效填写</span>}
              </Descriptions.Item>
            ))}
          </Descriptions>
          <Space style={{ margin: "16px 0" }}>
            {entity.locked ? (
              <Button
                type="primary"
                onClick={async () => {
                  const res = await api.post(`/api/entities/${entity.id}/lock`, { locked: false });
                  setEntity(res.data);
                  message.success("已解锁，可以进入治理");
                  window.dispatchEvent(new Event("pkm-refresh"));
                }}
              >
                解锁后治理
              </Button>
            ) : (
              <Button type="primary" onClick={() => onModeChange("edit")}>
                治理
              </Button>
            )}
            {entity.locked ? null : (
              <Popconfirm
                title="确认删除？"
                onConfirm={async () => {
                  await api.delete(`/api/entities/${entity.id}`);
                  message.success("已删除");
                  window.dispatchEvent(new Event("pkm-refresh"));
                  onClose();
                }}
              >
                <Button danger>删除</Button>
              </Popconfirm>
            )}
          </Space>
          <Timeline
            items={versions.map((v) => ({
              children: (
                <div>
                  v{v.version} {v.change_note} · {v.changed_by}{" "}
                  <Button type="link" size="small" onClick={() => setHistory(v)}>
                    与当前比较
                  </Button>
                </div>
              ),
            }))}
          />
        </>
      ) : null}

      {impact && <div style={{ marginTop: 16, color: "#667" }}>变更联动：{impact.change_note}</div>}

      <Modal
        title={history ? `比较历史版本 v${history.version}` : "版本对照"}
        open={!!history}
        onCancel={() => setHistory(null)}
        footer={null}
        width={980}
        destroyOnClose
      >
        {history && typeMeta && saved ? (
          <KnowledgeCompare
            typeMeta={typeMeta}
            current={saved}
            proposed={{
              name: history.name || "",
              summary: history.summary || "",
              payload: history.payload || {},
              tags: history.tags || [],
            }}
            mode="review"
            leftTitle="当前知识"
            rightTitle={`历史 v${history.version}`}
            locked={frozen}
            published={entity?.status === "published"}
            applying={saving}
            onApply={async (merged, note) => {
              await applyMerged(merged, note || `回退到 v${history.version} 的对照结果`);
              setHistory(null);
            }}
            onKeep={() => setHistory(null)}
          />
        ) : null}
      </Modal>
    </Drawer>
  );
}
