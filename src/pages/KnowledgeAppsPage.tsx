import { Button, Card, Collapse, Form, Input, Modal, Popconfirm, Select, Table, Tag, Typography, message } from "antd";
import { ResultTable } from "../components/SearchTable";
import { useEffect, useState } from "react";
import { api } from "../api";
import { CAP_HINTS, hasCap, useAuth } from "../auth";
import CapAction from "../components/CapAction";
import { useProduct } from "../product";
import KnowledgeReleasesPanel from "./KnowledgeReleasesPanel";

const DOCK_ENDPOINTS = [
  { method: "GET", path: "/v1/knowledge/releases", desc: "可访问的知识版本" },
  { method: "GET", path: "/v1/knowledge/releases/latest?scope=combined", desc: "某范围最新冻结版本" },
  { method: "GET", path: "/v1/knowledge/releases/{id}", desc: "版本说明与 System Prompt" },
  { method: "GET", path: "/v1/knowledge/releases/{id}/download?fmt=rag", desc: "下载该版本（rag/sft/system/json…）" },
  { method: "POST", path: "/v1/knowledge/ask", desc: "按已治理知识问答" },
  { method: "POST", path: "/v1/knowledge/search", desc: "检索已治理切片" },
];

/**
 * 平台知识应用：唯一的打包、下载与对接入口。
 */
export default function KnowledgeAppsPage() {
  const { user } = useAuth();
  const { products } = useProduct();
  const [catalog, setCatalog] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [createdToken, setCreatedToken] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [form] = Form.useForm();
  const canApp = hasCap(user, "app_write");
  const apiOrigin = typeof window !== "undefined" ? window.location.origin.replace(/:\d+$/, ":8000") : "";

  /**
   * 刷新总览与凭据。
   */
  const load = () => {
    api
      .get("/api/knowledge-apps")
      .then((res) => setCatalog(res.data))
      .catch(() =>
        setCatalog({
          global_prompt: "",
          api_base: "/v1/knowledge",
          summary: { product_total: 0, corpus_docs: 0, type_ready: 0 },
        }),
      );
    api
      .get("/api/apps")
      .then((res) => setApps(res.data || []))
      .catch(() => setApps([]));
  };

  useEffect(() => {
    load();
  }, []);

  if (!catalog) return null;

  return (
    <div>
      <div className="pkm-page-kicker">API</div>
      <h1 className="pkm-page-title">知识应用</h1>
      <p className="pkm-page-desc">
        打包、下载和对接都在本页完成。先把已治理知识打成冻结版本，再用 Token 给其它平台调用。产品工作台的「投喂预览」只负责试问，不在那里打包。
      </p>
      <div className="pkm-kpi-row">
        <div className="pkm-kpi">
          <b>{catalog.summary?.product_total || 0}</b>
          <span>产品</span>
        </div>
        <div className="pkm-kpi">
          <b>{catalog.summary?.corpus_docs || 0}</b>
          <span>已治理切片</span>
        </div>
        <div className="pkm-kpi">
          <b>{catalog.summary?.type_ready || 0}</b>
          <span>已治理对象类</span>
        </div>
      </div>

      <KnowledgeReleasesPanel />

      <div className="pkm-section-title">对接</div>
      <p className="pkm-muted" style={{ marginTop: 0, marginBottom: 12 }}>
        给客服助手、向量库、评测脚本等机器用。创建后把 <code>pkm_</code> Token 配到对方平台。可限定产品范围，作废后立即失效。
      </p>
      <ResultTable
          rowKey="id"
          dataSource={apps}
          onRefresh={load}
          locale={{ emptyText: "还没有应用。新建后把 Token 配到其它 AI 平台，即可读取冻结版本。" }}
          operations={
            <CapAction allowed={canApp} hint={CAP_HINTS.app_write}>
              <Button type="primary" onClick={() => setOpenCreate(true)}>
                新建
              </Button>
            </CapAction>
          }
          columns={[
            { title: "应用", dataIndex: "name" },
            { title: "Token 前缀", dataIndex: "token_prefix", width: 160 },
            {
              title: "产品范围",
              render: (_: unknown, row: any) =>
                row.product_ids?.length ? row.product_ids.map((id: number) => products.find((p) => p.id === id)?.name || id).join("、") : "全部产品",
            },
            {
              title: "状态",
              width: 90,
              render: (_: unknown, row: any) => (row.revoked ? <Tag>已作废</Tag> : <Tag color="success">有效</Tag>),
            },
            {
              title: "操作",
              key: "operations",
              hideable: false,
              width: 90,
              render: (_: unknown, row: any) =>
                canApp && !row.revoked ? (
                  <Popconfirm
                    title="作废后不可恢复，其它平台将无法调用"
                    onConfirm={async () => {
                      await api.delete(`/api/apps/${row.id}`);
                      message.success("已作废");
                      load();
                    }}
                  >
                    <Button type="link" danger>
                      作废
                    </Button>
                  </Popconfirm>
                ) : null,
            },
          ]}
        />

      <Card title="调用方式" style={{ marginTop: 16 }}>
        <p className="pkm-muted" style={{ marginTop: 0 }}>
          基址 <code>{catalog.api_base}</code>。请求头 <code>Authorization: Bearer pkm_...</code> 或 <code>X-Api-Key</code>。
          优先打冻结版本；问答 / 检索走当前已治理库。
        </p>
        <Table
          rowKey="path"
          size="small"
          pagination={false}
          dataSource={DOCK_ENDPOINTS}
          columns={[
            { title: "方法", dataIndex: "method", width: 90 },
            { title: "路径", dataIndex: "path" },
            { title: "说明", dataIndex: "desc" },
          ]}
        />
        <pre className="pkm-code" style={{ marginTop: 12 }}>
          {`# 1. 本页新建应用，复制 Token
# 2. 在知识版本里选好一版，或用 latest
curl -H "Authorization: Bearer pkm_..." \\
  ${apiOrigin}/v1/knowledge/releases/latest?scope=combined`}
        </pre>
        <Collapse
          ghost
          items={[
            {
              key: "prompt",
              label: "公司级 System Prompt 骨架",
              children: (
                <>
                  <p className="pkm-muted">跨产品助手的人设提纲。完整口径请用「多产品整合」版本里的 System Prompt。</p>
                  <pre className="pkm-code">{catalog.global_prompt || "暂无产品。"}</pre>
                </>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新建应用"
        open={openCreate}
        onCancel={() => setOpenCreate(false)}
        onOk={() => form.submit()}
        okText="创建并显示 Token"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            const res = await api.post("/api/apps", values);
            setCreatedToken(res.data.token || "");
            setOpenCreate(false);
            form.resetFields();
            load();
          }}
        >
          <Form.Item name="name" label="应用名称" rules={[{ required: true, message: "请填写名称" }]}>
            <Input placeholder="例如：客服助手 / 需求预研" />
          </Form.Item>
          <Form.Item name="note" label="用途说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="product_ids" label="可访问产品" extra="不选表示全部产品">
            <Select mode="multiple" allowClear options={products.map((item) => ({ value: item.id, label: item.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="请立即复制 Token"
        open={!!createdToken}
        onOk={() => setCreatedToken("")}
        onCancel={() => setCreatedToken("")}
        okText="已复制，关闭"
        cancelButtonProps={{ style: { display: "none" } }}
      >
        <Typography.Paragraph type="secondary">明文只显示这一次，请交给对接的 AI 平台妥善保存。</Typography.Paragraph>
        <Input.TextArea value={createdToken} readOnly rows={3} />
        <Button
          style={{ marginTop: 8 }}
          onClick={() => {
            navigator.clipboard.writeText(createdToken);
            message.success("已复制");
          }}
        >
          复制
        </Button>
      </Modal>
    </div>
  );
}
