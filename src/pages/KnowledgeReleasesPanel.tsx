import { Button, Drawer, Dropdown, Form, Input, Modal, Popconfirm, Radio, Select, Space, Table, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { api, downloadAuth } from "../api";
import { useAuth } from "../auth";
import { useProduct } from "../product";

const FORMATS = [
  { fmt: "json", label: "JSON 知识包", file: "knowledge-pack.json" },
  { fmt: "system", label: "System Prompt", file: "system-prompt.txt" },
  { fmt: "rag", label: "RAG JSONL", file: "rag-chunks.jsonl" },
  { fmt: "sft", label: "指令微调 JSONL", file: "llm-sft.jsonl" },
  { fmt: "pretrain", label: "预训练 JSONL", file: "llm-pretrain.jsonl" },
  { fmt: "corpus", label: "问答 Markdown", file: "llm-corpus.md" },
];

interface ReleaseRow {
  id: number;
  version: string;
  name: string;
  scope: string;
  scope_label: string;
  product_ids: number[];
  trigger: string;
  note: string;
  product_count: number;
  corpus_docs: number;
  type_ready: number;
  created_by: string;
  created_at: string;
}

/**
 * 把 UTC 时间格式化为本地时间。
 * @param {string} value
 */
function formatTime(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 知识版本：手动/自动打包，按格式下载或对接 AI。
 */
export default function KnowledgeReleasesPanel() {
  const { user } = useAuth();
  const { products } = useProduct();
  const canEdit = user?.role !== "viewer";
  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [open, setOpen] = useState(false);
  const [dock, setDock] = useState<ReleaseRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const scope = Form.useWatch("scope", form);

  /**
   * 刷新版本列表。
   */
  const load = () => {
    api.get("/api/knowledge-releases").then((res) => setRows(res.data || []));
  };

  useEffect(() => {
    load();
  }, []);

  /**
   * 下载某版本指定格式。
   * @param {ReleaseRow} row
   * @param {{fmt: string, file: string}} item
   */
  const download = (row: ReleaseRow, item: { fmt: string; file: string }) => {
    const zip = row.scope === "all";
    downloadAuth(`/api/knowledge-releases/${row.id}/download?fmt=${item.fmt}`, `${row.version}-${zip ? item.fmt + ".zip" : item.file}`);
  };

  /**
   * 产品范围文案。
   * @param {ReleaseRow} row
   */
  const scopeText = (row: ReleaseRow) => {
    if (row.scope === "all") return "全部产品，每产品一份";
    if (row.scope === "combined") {
      if (!row.product_ids?.length) return "全部产品整合为一份";
      return row.product_ids.map((id) => products.find((p) => p.id === id)?.name || id).join("、") + " · 整合";
    }
    return row.product_ids.map((id) => products.find((p) => p.id === id)?.name || id).join("、") || "单产品";
  };

  return (
    <div>
      <div className="pkm-section-title">知识版本</div>
      <p className="pkm-page-desc" style={{ marginBottom: 12 }}>
        把当时已治理知识打成冻结版本。可按单个产品、全部分册或多产品整合打包；修改知识后会自动打一版单产品包。在线对接请到下方先建 Token，再对版本接口。
      </p>
      <Space style={{ marginBottom: 12 }}>
        {canEdit ? (
          <Button
            type="primary"
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ scope: "product" });
              setOpen(true);
            }}
          >
            打包版本
          </Button>
        ) : null}
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={rows.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
        locale={{ emptyText: "还没有版本。打包后即可下载或给其它 AI 平台对接。" }}
        columns={[
          { title: "版本", dataIndex: "version", width: 72 },
          { title: "名称", dataIndex: "name", ellipsis: true },
          {
            title: "范围",
            render: (_: unknown, row: ReleaseRow) => (
              <span>
                <Tag>{row.scope_label}</Tag>
                {scopeText(row)}
              </span>
            ),
          },
          {
            title: "来源",
            width: 80,
            render: (_: unknown, row: ReleaseRow) => (row.trigger === "auto" ? <Tag>自动</Tag> : <Tag color="blue">手动</Tag>),
          },
          { title: "切片", dataIndex: "corpus_docs", width: 70 },
          { title: "时间", width: 150, render: (_: unknown, row: ReleaseRow) => formatTime(row.created_at) },
          { title: "操作人", dataIndex: "created_by", width: 90 },
          {
            title: "操作",
            width: 260,
            render: (_: unknown, row: ReleaseRow) => (
              <Space>
                <Dropdown
                  menu={{
                    items: FORMATS.map((item) => ({ key: item.fmt, label: item.label })),
                    onClick: ({ key }) => download(row, FORMATS.find((item) => item.fmt === key)!),
                  }}
                >
                  <Button type="link">下载</Button>
                </Dropdown>
                <Button type="link" onClick={() => setDock(row)}>
                  对接 AI
                </Button>
                {canEdit ? (
                  <Popconfirm
                    title="删除该冻结版本？不影响当前知识。"
                    onConfirm={async () => {
                      await api.delete(`/api/knowledge-releases/${row.id}`);
                      message.success("已删除");
                      load();
                    }}
                  >
                    <Button type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="打包知识版本"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="开始打包"
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setLoading(true);
            try {
              const product_ids =
                values.scope === "product" ? (values.product_id ? [values.product_id] : []) : values.product_ids || [];
              await api.post("/api/knowledge-releases", { ...values, product_ids });
              message.success("已打包版本");
              setOpen(false);
              load();
            } catch (err: any) {
              message.error(err?.response?.data?.detail || "打包失败");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item name="scope" label="打包范围" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="product">单个产品</Radio.Button>
              <Radio.Button value="all">全部产品分册</Radio.Button>
              <Radio.Button value="combined">多产品整合</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {scope === "product" ? (
            <Form.Item name="product_id" label="产品" rules={[{ required: true, message: "请选择产品" }]}>
              <Select options={products.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
          ) : null}
          {scope === "combined" ? (
            <Form.Item name="product_ids" label="整合产品" extra="不选表示把全部产品合成一份语料">
              <Select mode="multiple" allowClear options={products.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
          ) : null}
          {scope === "all" ? <p className="pkm-muted">每个产品单独一份文件，下载为 zip。</p> : null}
          <Form.Item name="name" label="版本名称">
            <Input placeholder="如 春季口径 / 客服助手 v3" />
          </Form.Item>
          <Form.Item name="note" label="说明">
            <Input.TextArea rows={2} placeholder="这次打包给谁用、和上一版差在哪" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title={dock ? `${dock.version} · 对接 AI` : ""} open={!!dock} width={560} onClose={() => setDock(null)}>
        {dock ? (
          <>
            <Typography.Paragraph type="secondary">
              先在本页「对接」里新建应用并复制 Token，再用下面地址读取这一版。不要用登录账号，也不要打未打包的当前库。
            </Typography.Paragraph>
            <pre className="pkm-code">{`# 版本说明与 System Prompt
GET /v1/knowledge/releases/${dock.id}

# 按格式下载
GET /v1/knowledge/releases/${dock.id}/download?fmt=rag
GET /v1/knowledge/releases/${dock.id}/download?fmt=sft
GET /v1/knowledge/releases/${dock.id}/download?fmt=system

# 该范围最新一版
GET /v1/knowledge/releases/latest?scope=${dock.scope}

curl -H "Authorization: Bearer pkm_..." \\
  ${window.location.origin.replace(/:\\d+$/, ":8000")}/v1/knowledge/releases/${dock.id}`}</pre>
            <Space wrap style={{ marginTop: 12 }}>
              {FORMATS.map((item) => (
                <Button key={item.fmt} onClick={() => download(dock, item)}>
                  {item.label}
                </Button>
              ))}
            </Space>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
