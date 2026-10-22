import { Button, Card, Checkbox, Dropdown, Form, Input, Modal, Select, Space, Table, Tag, Timeline, Typography, message } from "antd";
import { QueryForm, ResultTable } from "../components/SearchTable";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, downloadAuth } from "../api";
import { useAuth } from "../auth";
import { KNOWLEDGE_MODELS } from "../paths";
import { FIELD_TYPE_OPTIONS, columnsFromHint } from "../components/FieldTableInput";

const ACTION_LABEL: Record<string, string> = {
  save: "保存覆盖",
  reset: "恢复默认",
  create: "首次覆盖",
};

const SKILL_DOWNLOADS = [
  { fmt: "md", label: "Markdown", ext: "md" },
  { fmt: "xlsx", label: "Excel", ext: "xlsx" },
  { fmt: "docx", label: "Word", ext: "docx" },
];

/**
 * 解析技能配置台：提示词槽位、全局原则、文档种类、对象类型。
 * 大模型分析不写死限制；范围与要求从这里注入，治理详情与抽取共用字段。
 */
export default function ExtractSkillsPanel() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [keyword, setKeyword] = useState("");
  const [queryForm] = Form.useForm();
  const [editing, setEditing] = useState<any>(null);
  const [fieldRows, setFieldRows] = useState<any[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [form] = Form.useForm();
  const [history, setHistory] = useState<any[]>([]);
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
   * 拉取某条技能的变更历史。
   * @param {string} kind
   * @param {string} [refKey]
   */
  const loadHistory = (kind: string, refKey = "") => {
    api
      .get("/api/extract-skills/history", { params: { kind, ref_key: refKey } })
      .then((res) => setHistory(Array.isArray(res.data) ? res.data : []))
      .catch(() => setHistory([]));
  };

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
    loadHistory(payload.kind, payload.ref_key || "");
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
   * 下载对象技能。支持 Markdown / Excel / Word。
   * @param {string} typeId
   * @param {string} name
   * @param {string} fmt
   */
  const downloadType = (typeId: string, name: string, fmt: string) => {
    const item = SKILL_DOWNLOADS.find((row) => row.fmt === fmt) || SKILL_DOWNLOADS[1];
    downloadAuth(
      `/api/extract-skills/types/${typeId}/download?fmt=${item.fmt}`,
      `${typeId}-${name || "技能"}.${item.ext}`,
    );
  };

  /**
   * 下载全部对象技能。
   * @param {string} fmt
   */
  const downloadAll = (fmt: string) => {
    const item = SKILL_DOWNLOADS.find((row) => row.fmt === fmt) || SKILL_DOWNLOADS[1];
    downloadAuth(`/api/extract-skills/download/types?fmt=${item.fmt}`, `对象类型技能.${item.ext}`);
  };

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
   * 把编辑框填回系统默认，不立刻写库。
   */
  const applyDefaultsToForm = () => {
    if (!editing) return;
    form.setFieldsValue({
      instruction: editing.default_instruction || "",
      examples: editing.default_examples || "",
      focus_model_codes: editing.default_focus_model_codes || [],
    });
    if (editing.kind === "type") {
      setFieldRows((editing.catalog_fields || []).map((item: any) => ({ ...item })));
      setHiddenKeys([]);
    }
  };

  /**
   * 二次确认后，仅回填默认文字。
   */
  const confirmRestore = () => {
    Modal.confirm({
      title: "恢复默认？",
      content: "编辑框将填入系统默认文字，需点「保存覆盖」后才对本账号生效，不影响其他用户。",
      okText: "填入默认",
      cancelText: "取消",
      onOk: applyDefaultsToForm,
    });
  };

  if (!data) return null;

  const editingRelated = editing?.kind === "document_kind" ? editing.related_types || [] : [];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="抽取提示词">
        <p className="pkm-muted">
          每位用户看到的默认内容相同。你保存的覆盖只作用于自己的抽取，不影响其他人。系统提示词、输出格式、补空字段与来源说明改完保存后，下次抽取即生效。
        </p>
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={data.prompts || []}
          columns={[
            { title: "槽位", dataIndex: "title", width: 160 },
            { title: "说明", dataIndex: "hint", ellipsis: true },
            {
              title: "来源",
              width: 90,
              render: (_: unknown, row: any) => (row.is_default ? <Tag>默认</Tag> : <Tag color="blue">已覆盖</Tag>),
            },
            {
              title: "操作",
              width: 80,
              render: (_: unknown, row: any) =>
                canEdit ? (
                  <Button type="link" onClick={() => openEdit({ kind: "prompt", ref_key: row.key, ...row })}>
                    编辑
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>

      <Card
        title="全局解析原则"
        extra={data.global?.is_default ? <Tag>默认</Tag> : <Tag color="blue">已覆盖</Tag>}
      >
        <p className="pkm-muted">每次抽取都会注入。写通用分析能力即可，按文档种类或对象收窄请改下面两类技能。</p>
        <pre className="pkm-code">{data.global?.instruction}</pre>
        {canEdit ? (
          <Button style={{ marginTop: 12 }} onClick={() => openEdit({ kind: "global", ref_key: "", ...data.global })}>
            编辑
          </Button>
        ) : null}
      </Card>

      <Card title="文档种类技能">
        <p className="pkm-muted">
          按文档来源注入：识别为 PRD、手册、接口或培训后，把本类原则和优先模型交给大模型。改这里就能调整该类文档的分析目标。
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
              width: 80,
              render: (_: unknown, row: any) =>
                canEdit ? (
                  <Button type="link" onClick={() => openEdit({ kind: "document_kind", ref_key: row.key, ...row })}>
                    编辑
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>

      <div className="pkm-search-stack">
      <p className="pkm-muted" style={{ marginBottom: 8 }}>
        按对象范围注入：抽取某类对象时带上该对象的原则、正反例和治理字段。改形态、表头、填写说明或抽取原则后需保存，下载 Word / Markdown / Excel 会按当前技能生成。表格形态在文档里出表，多行出段落。
      </p>
      <QueryForm
        form={queryForm}
        onSearch={() => setKeyword(String(queryForm.getFieldValue("q") || "").trim())}
        onReset={() => {
          queryForm.resetFields();
          setKeyword("");
        }}
      >
        <Form.Item name="q" label="对象">
          <Input allowClear placeholder="请输入编号 / 名称" />
        </Form.Item>
      </QueryForm>
      <ResultTable
          rowKey="type_id"
          dataSource={types}
          onRefresh={load}
          operations={
            <Dropdown
              menu={{
                items: SKILL_DOWNLOADS.map((item) => ({ key: item.fmt, label: item.label })),
                onClick: ({ key }) => downloadAll(String(key)),
              }}
            >
              <Button>下载全部</Button>
            </Dropdown>
          }
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
              key: "operations",
              hideable: false,
              width: 220,
              render: (_: unknown, row: any) => (
                <Space>
                  <Dropdown
                    menu={{
                      items: SKILL_DOWNLOADS.map((item) => ({ key: item.fmt, label: item.label })),
                      onClick: ({ key }) => downloadType(row.type_id, row.name || "技能", String(key)),
                    }}
                  >
                    <Button type="link">下载</Button>
                  </Dropdown>
                  {canEdit ? (
                    <Button type="link" onClick={() => openEdit({ kind: "type", ref_key: row.type_id, ...row })}>
                      编辑
                    </Button>
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      </div>

      <Modal
        title={
          editing?.kind === "type"
            ? `对象技能 · ${editing.type_id || ""} ${editing.name || ""}`
            : editing?.kind === "document_kind"
              ? `文档种类 · ${editing.title || ""}`
              : editing?.kind === "prompt"
                ? `抽取提示词 · ${editing.title || ""}`
                : "编辑抽取技能"
        }
        open={!!editing}
        width={editing?.kind === "type" ? 1040 : editing?.kind === "document_kind" ? 880 : 720}
        onCancel={() => {
          setEditing(null);
          setHistory([]);
        }}
        footer={[
          canEdit ? (
            <Button key="restore" onClick={confirmRestore}>
              恢复默认
            </Button>
          ) : null,
          <Button
            key="cancel"
            onClick={() => {
              setEditing(null);
              setHistory([]);
            }}
          >
            取消
          </Button>,
          <Button key="ok" type="primary" disabled={!canEdit} onClick={() => form.submit()}>
            保存覆盖
          </Button>,
        ]}
      >
        {canEdit ? (
          <p className="pkm-muted" style={{ marginBottom: 12 }}>
            「恢复默认」只改当前编辑框，点「保存覆盖」后才对本账号生效。
          </p>
        ) : null}
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
                      onChange={(value) => {
                        const patch: Record<string, unknown> = { type: value };
                        if (value === "table" && !(row.options || []).length) {
                          const cols = columnsFromHint(row.fill_hint || "");
                          patch.options = cols.length ? cols : ["列1", "列2"];
                        }
                        patchField(index, patch);
                      }}
                      options={FIELD_TYPE_OPTIONS}
                    />
                  ),
                },
                {
                  title: "选项/表头",
                  width: 200,
                  render: (_: unknown, row: any, index: number) =>
                    row.type === "select" || row.type === "table" ? (
                      <Select
                        mode="tags"
                        value={row.options || []}
                        disabled={!canEdit}
                        style={{ width: "100%" }}
                        placeholder={row.type === "table" ? "表头，回车添加" : "选项，回车添加"}
                        tokenSeparators={[",", "，", "、"]}
                        onChange={(value) => patchField(index, { options: value })}
                      />
                    ) : (
                      <span className="pkm-muted">—</span>
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
        {editing?.kind === "prompt" && editing.hint ? (
          <div className="pkm-muted" style={{ marginBottom: 12 }}>
            {editing.hint}
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
            label={
              editing?.kind === "type"
                ? "抽取原则（字段以上表为准）"
                : editing?.kind === "prompt"
                  ? "提示词正文"
                  : "抽取原则 / 字段要求"
            }
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
        {history.length ? (
          <div style={{ marginTop: 16 }}>
            <Typography.Text type="secondary">变更历史</Typography.Text>
            <Timeline
              style={{ marginTop: 12, maxHeight: 220, overflow: "auto" }}
              items={history.map((item: any) => ({
                children: (
                  <div>
                    <div>
                      {ACTION_LABEL[item.action] || item.action} · {item.changed_by || "—"} · {item.created_at || ""}
                    </div>
                    {item.instruction ? (
                      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                        {item.instruction}
                      </Typography.Paragraph>
                    ) : null}
                  </div>
                ),
              }))}
            />
          </div>
        ) : null}
      </Modal>
    </Space>
  );
}
