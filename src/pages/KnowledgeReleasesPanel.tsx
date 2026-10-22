import { Alert, Button, Dropdown, Form, Input, Modal, Popconfirm, Radio, Select, Space, Table, Tag, Typography, message } from "antd";
import ResizableDrawer from "../components/ResizableDrawer";
import { ResultTable } from "../components/SearchTable";
import { useEffect, useState } from "react";
import { api, downloadAuth } from "../api";
import { CAP_HINTS, hasCap, useAuth } from "../auth";
import CapAction from "../components/CapAction";
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

interface DiffItem {
  id: number;
  type_id?: string;
  title?: string;
}

interface DiffResult {
  from: ReleaseRow | null;
  to: ReleaseRow;
  added: DiffItem[];
  removed: DiffItem[];
  changed: DiffItem[];
}

/**
 * 展示时间。无时区的 SQLite 文本按原文；ISO 按 UTC 转成本地。
 * @param {string} value
 */
function formatTime(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (/^\d{4}-\d{2}-\d{2} /.test(raw) && !/[zZ]$/.test(raw) && !/[+-]\d{2}:?\d{2}$/.test(raw)) {
    return raw.slice(0, 16);
  }
  const date = new Date(/[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 知识版本：手动/自动打包，按格式下载或对接 AI。
 */
export default function KnowledgeReleasesPanel() {
  const { user } = useAuth();
  const { products } = useProduct();
  const canRelease = hasCap(user, "release_write");
  const canPack = hasCap(user, "pack_write") || canRelease;
  const canDownload = hasCap(user, "pack_download");
  const canDock = hasCap(user, "app_write");
  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [open, setOpen] = useState(false);
  const [dock, setDock] = useState<ReleaseRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const scope = Form.useWatch("scope", form);
  const [diffTo, setDiffTo] = useState<ReleaseRow | null>(null);
  const [againstId, setAgainstId] = useState<number | undefined>();
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

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
  /**
   * 拉取两版切片增删改。
   * @param {number} toId
   * @param {number} [against]
   */
  const loadDiff = async (toId: number, against?: number) => {
    setDiffLoading(true);
    try {
      const res = await api.get(`/api/knowledge-releases/${toId}/diff`, { params: against ? { against } : {} });
      setDiff(res.data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || "对照失败");
    } finally {
      setDiffLoading(false);
    }
  };

  /**
   * 打开版本对照，默认对比上一版。
   * @param {ReleaseRow} row
   */
  const openDiff = (row: ReleaseRow) => {
    const older = rows.find((item) => item.id < row.id);
    setDiffTo(row);
    setAgainstId(older?.id);
    setDiff(null);
    loadDiff(row.id, older?.id);
  };

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
        唯一的打包入口。可按单个产品、全部分册或多产品整合；知识变更后会自动打一版单产品包。下载与对接都针对冻结版本。
      </p>
      <ResultTable<ReleaseRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        onRefresh={load}
        locale={{ emptyText: "还没有版本。打包后即可下载或给其它 AI 平台对接。" }}
        operations={
          <CapAction allowed={canPack} hint={CAP_HINTS.release_write}>
            <Button
              type="primary"
              onClick={() => {
                form.resetFields();
                form.setFieldsValue({ scope: "product" });
                setOpen(true);
              }}
            >
              新建
            </Button>
          </CapAction>
        }
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
            key: "operations",
            hideable: false,
            width: 300,
            render: (_: unknown, row: ReleaseRow) => (
              <Space>
                <Button type="link" onClick={() => openDiff(row)}>
                  对照
                </Button>
                <CapAction allowed={canDownload} hint={CAP_HINTS.pack_download}>
                  <Dropdown
                    menu={{
                      items: FORMATS.map((item) => ({ key: item.fmt, label: item.label })),
                      onClick: ({ key }) => download(row, FORMATS.find((item) => item.fmt === key)!),
                    }}
                  >
                    <Button type="link">下载</Button>
                  </Dropdown>
                </CapAction>
                <CapAction allowed={canDock} hint={CAP_HINTS.app_write}>
                  <Button type="link" onClick={() => setDock(row)}>
                    对接 AI
                  </Button>
                </CapAction>
                {canRelease ? (
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
            const product_ids =
              values.scope === "product" ? (values.product_id ? [values.product_id] : []) : values.product_ids || [];
            try {
              const ready = await api.get("/api/knowledge-releases/readiness", {
                params: { scope: values.scope, product_ids: product_ids.join(",") },
              });
              if (!ready.data.can_pack) {
                message.warning(ready.data.warning || "还没有已治理知识，不能打成知识版本。");
                return;
              }
              if (ready.data.ungoverned) {
                const ok = await new Promise<boolean>((resolve) => {
                  Modal.confirm({
                    title: "存在未治理知识",
                    content: ready.data.warning,
                    okText: "仍打包已治理部分",
                    cancelText: "先去治理",
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                  });
                });
                if (!ok) return;
              }
            } catch {
              /* 无 readiness 时交给打包接口拦截空切片 */
            }
            setLoading(true);
            try {
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

      <ResizableDrawer title={dock ? `${dock.version} · 对接 AI` : ""} open={!!dock} width={560} minWidth={400} onClose={() => setDock(null)}>
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
      </ResizableDrawer>

      <Modal
        title={diffTo ? `对照 ${diffTo.version}` : "版本对照"}
        open={!!diffTo}
        onCancel={() => setDiffTo(null)}
        footer={null}
        width={720}
      >
        <div className="pkm-muted" style={{ marginBottom: 8 }}>
          对比基准
        </div>
        <Select
          style={{ width: "100%", marginBottom: 12 }}
          allowClear
          placeholder="上一版（不选则自动取更早一版）"
          value={againstId}
          options={rows.filter((item) => item.id !== diffTo?.id).map((item) => ({ value: item.id, label: `${item.version} ${item.name || ""}`.trim() }))}
          onChange={(value) => {
            setAgainstId(value);
            if (diffTo) loadDiff(diffTo.id, value);
          }}
        />
        {diffLoading ? (
          <Alert type="info" showIcon message="正在对照…" />
        ) : diff ? (
          <>
            <Alert
              type={(diff.added.length || diff.removed.length || diff.changed.length) ? "warning" : "success"}
              showIcon
              message={diff.from ? `${diff.from.version} → ${diff.to.version}` : `没有更早版本，${diff.to.version} 为当前对照目标`}
              description={`新增 ${diff.added.length} · 减少 ${diff.removed.length} · 正文变化 ${diff.changed.length}`}
            />
            {(diff.added.length || diff.removed.length || diff.changed.length) ? (
              <Table
                style={{ marginTop: 12 }}
                size="small"
                pagination={false}
                rowKey={(row) => `${row.kind}-${row.id}`}
                dataSource={[
                  ...diff.added.map((item) => ({ ...item, kind: "新增" })),
                  ...diff.removed.map((item) => ({ ...item, kind: "减少" })),
                  ...diff.changed.map((item) => ({ ...item, kind: "变化" })),
                ]}
                columns={[
                  { title: "变化", dataIndex: "kind", width: 80 },
                  { title: "对象", dataIndex: "type_id", width: 100 },
                  { title: "切片", dataIndex: "title" },
                ]}
              />
            ) : null}
          </>
        ) : null}
      </Modal>
    </div>
  );
}
