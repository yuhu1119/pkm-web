import { Button, Card, Checkbox, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, downloadAuth } from "../api";
import { useAuth } from "../auth";
import { KNOWLEDGE_MODELS } from "../paths";

/**
 * 解析技能配置台：全局原则、文档种类、对象类型。
 * 对象字段可在此调整，治理详情与 AI 抽取共用。
 */
export default function ExtractSkillsPanel() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [fieldRows, setFieldRows] = useState<any[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [form] = Form.useForm();
  const openedQuery = useRef(false);
  const canEdit = user?.role !== "viewer";

  /**
   * 拉取技能清单。
   */
  const load = () => {
    api.get("/api/extract-skills").then((res) => setData(res.data));
  };

  useEffect(() => {
    load();
  }, []);

  const types = useMemo(() => {
    const rows = data?.types || [];
    const q = keyword.trim();
    if (!q) return rows;
    return rows.filter(
      (item: any) =>
        item.type_id?.includes(q) ||
        item.name?.includes(q) ||
        item.model_name?.includes(q),
    );
  }, [data, keyword]);

  /**
   * 打开编辑弹窗。
   * @param {any} payload
   */
  const openEdit = (payload: any) => {
    setEditing(payload);
    setFieldRows((payload.fields || []).map((item: any) => ({ ...item })));
    setHiddenKeys([...(payload.hidden_keys || [])]);
    form.setFieldsValue({
      instruction: payload.instruction || "",
      examples: payload.examples || "",
      focus_model_codes: payload.focus_model_codes || [],
    });
  };

  /**
   * 改一行字段。
   * @param {number} index
   * @param {Record<string, unknown>} patch
   */
  const patchField = (index: number, patch: Record<string, unknown>) => {
    setFieldRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  useEffect(() => {
    if (!data || openedQuery.current) return;
    const typeId = params.get("type");
    const kind = params.get("kind");
    if (typeId) {
      const row = (data.types || []).find((item: any) => item.type_id === typeId);
      if (row) {
        openedQuery.current = true;
        openEdit({
          kind: "type",
          ref_key: row.type_id,
          ...row,
        });
      }
    } else if (kind) {
      const row = (data.document_kinds || []).find((item: any) => item.key === kind);
      if (row) {
        openedQuery.current = true;
        openEdit({
          kind: "document_kind",
          ref_key: row.key,
          ...row,
        });
      }
    }
  }, [data, params]);

  /**
   * 保存覆盖。
   */
  const save = async (values: any) => {
    await api.put("/api/extract-skills", {
      kind: editing.kind,
      ref_key: editing.ref_key || "",
      instruction: values.instruction,
      examples: values.examples,
      focus_model_codes: values.focus_model_codes || [],
      fields: editing.kind === "type" ? fieldRows : undefined,
      hidden_keys: editing.kind === "type" ? hiddenKeys : [],
    });
    message.success("已保存技能覆盖");
    setEditing(null);
    load();
  };

  /**
   * 恢复默认。
   * @param {string} kind
   * @param {string} [refKey]
   */
  const reset = async (kind: string, refKey = "") => {
    await api.delete("/api/extract-skills", { params: { kind, ref_key: refKey } });
    message.success("已恢复默认");
    load();
  };

  if (!data) return null;

  const editingRelated = editing?.kind === "document_kind" ? editing.related_types || [] : [];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="全局解析原则"
        extra={data.global?.is_default ? <Tag>默认</Tag> : <Tag color="blue">已覆盖</Tag>}
      >
        <pre className="pkm-code">{data.global?.instruction}</pre>
        {canEdit ? (
          <Space style={{ marginTop: 12 }}>
            <Button onClick={() => openEdit({ kind: "global", ref_key: "", instruction: data.global.instruction, examples: "" })}>
              编辑
            </Button>
            {!data.global?.is_default ? <Button onClick={() => reset("global")}>恢复默认</Button> : null}
          </Space>
        ) : null}
      </Card>

      <Card title="文档种类技能">
        <p className="pkm-muted">
          上传文档时按种类选用。扫描会参考这些原则判断覆盖范围；抽取时会带上本类优先关联的对象类型及其治理字段。
        </p>
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={data.document_kinds || []}
          columns={[
            { title: "种类", dataIndex: "title", width: 160 },
            {
              title: "优先模型",
              render: (_: unknown, row: any) =>
                (row.focus_model_names || []).join("、") || "按文档实际",
            },
            {
              title: "关联对象",
              width: 120,
              render: (_: unknown, row: any) => `${row.related_type_count || 0} 类`,
            },
            {
              title: "来源",
              width: 90,
              render: (_: unknown, row: any) => (row.is_default ? <Tag>默认</Tag> : <Tag color="blue">已覆盖</Tag>),
            },
            {
              title: "操作",
              width: 140,
              render: (_: unknown, row: any) =>
                canEdit ? (
                  <Space>
                    <Button type="link" onClick={() => openEdit({ kind: "document_kind", ref_key: row.key, ...row })}>
                      编辑
                    </Button>
                    {!row.is_default ? (
                      <Button type="link" onClick={() => reset("document_kind", row.key)}>
                        恢复
                      </Button>
                    ) : null}
                  </Space>
                ) : null,
            },
          ]}
        />
      </Card>

      <Card
        title="对象类型技能"
        extra={
          <Space>
            <Input.Search allowClear placeholder="编号 / 名称" onSearch={setKeyword} style={{ width: 220 }} />
            <Button onClick={() => downloadAuth("/api/extract-skills/download/types", "对象类型技能.csv")}>
              下载全部 Excel
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          78 类对象固定。每个对象的字段可改标签、必填、填写说明，也可隐藏或新增。保存后，治理详情和 AI 抽文档都用这张表。
        </Typography.Paragraph>
        <Table
          rowKey="type_id"
          size="small"
          pagination={{ pageSize: 12 }}
          dataSource={types}
          columns={[
            { title: "编号", dataIndex: "type_id", width: 100 },
            { title: "对象", dataIndex: "name" },
            { title: "模型", dataIndex: "model_name", width: 140 },
            {
              title: "治理字段",
              width: 110,
              render: (_: unknown, row: any) => `${row.field_count || (row.fields || []).length} 个`,
            },
            {
              title: "必填",
              ellipsis: true,
              render: (_: unknown, row: any) => (row.required_labels || []).join("、") || "—",
            },
            {
              title: "来源",
              width: 110,
              render: (_: unknown, row: any) =>
                row.fields_overridden ? (
                  <Tag color="blue">字段已调</Tag>
                ) : row.is_default ? (
                  <Tag>默认</Tag>
                ) : (
                  <Tag color="blue">原则已覆盖</Tag>
                ),
            },
            {
              title: "操作",
              width: 200,
              render: (_: unknown, row: any) => (
                <Space>
                  <Button
                    type="link"
                    onClick={() =>
                      downloadAuth(
                        `/api/extract-skills/types/${row.type_id}/download`,
                        `${row.type_id}-${row.name || "技能"}.csv`,
                      )
                    }
                  >
                    下载
                  </Button>
                  {canEdit ? (
                    <Button type="link" onClick={() => openEdit({ kind: "type", ref_key: row.type_id, ...row })}>
                      编辑
                    </Button>
                  ) : null}
                  {canEdit && !row.is_default ? (
                    <Button type="link" onClick={() => reset("type", row.type_id)}>
                      恢复
                    </Button>
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={
          editing?.kind === "type"
            ? `对象技能 · ${editing.type_id || ""} ${editing.name || ""}`
            : editing?.kind === "document_kind"
              ? `文档种类 · ${editing.title || ""}`
              : "编辑抽取技能"
        }
        open={!!editing}
        width={editing?.kind === "type" ? 1040 : editing?.kind === "document_kind" ? 880 : 720}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText="保存覆盖"
        okButtonProps={{ disabled: !canEdit }}
      >
        {editing?.kind === "type" ? (
          <div style={{ marginBottom: 16 }}>
            <div className="pkm-muted">{editing.core_question}</div>
            {(editing.related_document_kinds || []).length ? (
              <div style={{ marginTop: 8 }}>
                <span className="pkm-muted">关联文档种类：</span>
                {(editing.related_document_kinds || []).map((item: any) => (
                  <Tag key={item.key}>{item.title}</Tag>
                ))}
              </div>
            ) : null}
            <Space wrap style={{ marginTop: 12 }}>
              <Button
                disabled={!canEdit}
                onClick={() => {
                  const used = new Set(fieldRows.map((item) => item.key));
                  let n = 1;
                  let key = `extra_${n}`;
                  while (used.has(key)) {
                    n += 1;
                    key = `extra_${n}`;
                  }
                  setFieldRows((rows) => [
                    ...rows,
                    { key, label: "补充字段", type: "textarea", required: false, fill_hint: "", options: [], custom: true },
                  ]);
                }}
              >
                添加字段
              </Button>
              {hiddenKeys.length ? (
                <Button
                  disabled={!canEdit}
                  onClick={() => {
                    const catalog = editing.catalog_fields || [];
                    const restore = hiddenKeys
                      .map((key) => catalog.find((item: any) => item.key === key))
                      .filter(Boolean);
                    setFieldRows((rows) => [...rows, ...restore.map((item: any) => ({ ...item }))]);
                    setHiddenKeys([]);
                  }}
                >
                  恢复已隐藏的目录字段（{hiddenKeys.length}）
                </Button>
              ) : null}
            </Space>
            <Table
              style={{ marginTop: 12 }}
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={fieldRows}
              columns={[
                {
                  title: "字段 key",
                  width: 140,
                  render: (_: unknown, row: any, index: number) =>
                    row.custom ? (
                      <Input
                        value={row.key}
                        disabled={!canEdit}
                        onChange={(e) => patchField(index, { key: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })}
                      />
                    ) : (
                      <span>
                        {row.key}
                        <Tag style={{ marginLeft: 6 }}>目录</Tag>
                      </span>
                    ),
                },
                {
                  title: "详情标签",
                  width: 140,
                  render: (_: unknown, row: any, index: number) => (
                    <Input value={row.label} disabled={!canEdit} onChange={(e) => patchField(index, { label: e.target.value })} />
                  ),
                },
                {
                  title: "必填",
                  width: 64,
                  render: (_: unknown, row: any, index: number) => (
                    <Checkbox
                      checked={!!row.required}
                      disabled={!canEdit}
                      onChange={(e) => patchField(index, { required: e.target.checked })}
                    />
                  ),
                },
                {
                  title: "形态",
                  width: 110,
                  render: (_: unknown, row: any, index: number) => (
                    <Select
                      value={row.type || "textarea"}
                      disabled={!canEdit}
                      style={{ width: 100 }}
                      onChange={(value) => patchField(index, { type: value })}
                      options={[
                        { value: "text", label: "单行" },
                        { value: "textarea", label: "多行" },
                        { value: "select", label: "选项" },
                      ]}
                    />
                  ),
                },
                {
                  title: "填写说明",
                  render: (_: unknown, row: any, index: number) => (
                    <Input
                      value={row.fill_hint}
                      disabled={!canEdit}
                      placeholder="给治理页和 AI 抽取看"
                      onChange={(e) => patchField(index, { fill_hint: e.target.value })}
                    />
                  ),
                },
                {
                  title: "",
                  width: 72,
                  render: (_: unknown, row: any, index: number) =>
                    canEdit ? (
                      <Button
                        type="link"
                        danger
                        onClick={() => {
                          setFieldRows((rows) => rows.filter((_, i) => i !== index));
                          if (!row.custom) setHiddenKeys((keys) => (keys.includes(row.key) ? keys : [...keys, row.key]));
                        }}
                      >
                        {row.custom ? "删除" : "隐藏"}
                      </Button>
                    ) : null,
                },
              ]}
            />
          </div>
        ) : null}
        {editing?.kind === "document_kind" ? (
          <div style={{ marginBottom: 16 }}>
            <div className="pkm-muted">抽取时会带上这些对象类型的治理字段，与详情页一致。</div>
            <Table
              style={{ marginTop: 12 }}
              size="small"
              pagination={{ pageSize: 8 }}
              rowKey="type_id"
              dataSource={editingRelated}
              columns={[
                { title: "编号", dataIndex: "type_id", width: 100 },
                { title: "对象", dataIndex: "name" },
                { title: "模型", dataIndex: "model_name", width: 160 },
              ]}
              locale={{ emptyText: "按文档实际覆盖，不预设对象类型" }}
            />
          </div>
        ) : null}
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item
            name="instruction"
            label={editing?.kind === "type" ? "抽取原则（字段以上表为准）" : "抽取原则 / 字段要求"}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={editing?.kind === "type" ? 6 : 10} />
          </Form.Item>
          <Form.Item name="examples" label="正反例（可选）">
            <Input.TextArea rows={4} placeholder="例如：正确：一页一条。错误：把整份导航写成一个页面实例。" />
          </Form.Item>
          {editing?.kind === "document_kind" ? (
            <Form.Item name="focus_model_codes" label="优先一级模型">
              <Select
                mode="multiple"
                options={KNOWLEDGE_MODELS.map((item) => ({ value: item.code, label: `${item.code} ${item.name}` }))}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </Space>
  );
}
