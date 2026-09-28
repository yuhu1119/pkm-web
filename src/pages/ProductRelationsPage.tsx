import { Button, Card, Form, Input, Popconfirm, Select, Table, Tabs, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { workspacePath } from "../paths";
import { useProduct, type ProductCard } from "../product";

const REL_KINDS = [
  { value: "upstream", label: "上游" },
  { value: "downstream", label: "下游" },
  { value: "depends", label: "依赖" },
  { value: "provides", label: "能力输出" },
  { value: "integrates", label: "集成协同" },
  { value: "calls", label: "调用" },
];

/**
 * 单个产品的功能投影与跨产品关系。
 */
export default function ProductRelationsPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { products, reload } = useProduct();
  const [relForm] = Form.useForm();
  const [features, setFeatures] = useState<any[]>([]);
  const [relations, setRelations] = useState<any[]>([]);
  const [featRels, setFeatRels] = useState<any[]>([]);

  const id = Number(productId);
  const target = products.find((item) => item.id === id) || null;

  /**
   * 加载该产品功能与全部关系。
   * @param {number} pid
   */
  const loadExtra = (pid: number) => {
    if (!pid) return;
    api.get(`/api/products/${pid}/features`).then((res) => setFeatures(res.data));
    api.get("/api/product-relations").then((res) => setRelations(res.data));
    api.get("/api/feature-relations").then((res) => setFeatRels(res.data));
  };

  useEffect(() => {
    if (id) loadExtra(id);
  }, [id]);

  if (!id || (products.length > 0 && !target)) {
    return (
      <div>
        <div className="pkm-page-kicker">Projection</div>
        <h1 className="pkm-page-title">功能与关系</h1>
        <p className="pkm-page-desc">未找到该产品。</p>
        <Button type="link" onClick={() => navigate("/products")} style={{ paddingLeft: 0, marginTop: 8 }}>
          返回产品列表
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="pkm-page-head">
        <div>
          <div className="pkm-page-kicker">Projection</div>
          <h1 className="pkm-page-title">{target?.name || "产品"} · 功能与关系</h1>
          <p className="pkm-page-desc">模块与功能来自知识治理的 E02-001 / E02-002 投影，不是第二套主数据。</p>
        </div>
      </div>
      <Card>
      <Tabs
        items={[
          {
            key: "features",
            label: "功能细分（知识投影）",
            children: (
              <>
                <p className="pkm-muted" style={{ marginBottom: 12 }}>
                  模块与功能来自知识治理的 E02-001 / E02-002，不是第二套主数据。请到知识治理维护，需要时点同步。
                </p>
                <Button
                  style={{ marginBottom: 16 }}
                  onClick={async () => {
                    if (!target) return;
                    await api.post(`/api/products/${target.id}/knowledge/init`, { mode: "sync_features" });
                    loadExtra(target.id);
                    await reload();
                    message.success("已从模块/功能知识同步");
                  }}
                >
                  从知识同步
                </Button>
                <Button type="link" onClick={() => navigate(workspacePath(id, "/knowledge/2"))}>
                  去模块模型治理
                </Button>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={features}
                  columns={[
                    { title: "类型", dataIndex: "kind", width: 80 },
                    { title: "名称", dataIndex: "name" },
                    { title: "说明", dataIndex: "summary", ellipsis: true },
                    {
                      title: "知识实例",
                      width: 100,
                      render: (_: unknown, row: any) => (row.entity_id ? `#${row.entity_id}` : "—"),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: "product-rel",
            label: "产品关系",
            children: (
              <>
                <Form
                  form={relForm}
                  layout="inline"
                  style={{ marginBottom: 16 }}
                  onFinish={async (values) => {
                    await api.post("/api/product-relations", {
                      from_id: values.from_id,
                      to_id: values.to_id,
                      kind: values.kind,
                      label: REL_KINDS.find((item) => item.value === values.kind)?.label,
                      note: values.note || "",
                    });
                    relForm.resetFields();
                    loadExtra(target!.id);
                    message.success("已添加产品关系");
                  }}
                >
                  <Form.Item name="from_id" rules={[{ required: true }]} initialValue={id}>
                    <Select placeholder="从" style={{ width: 180 }} options={products.map((p) => ({ value: p.id, label: p.name }))} />
                  </Form.Item>
                  <Form.Item name="kind" initialValue="depends">
                    <Select options={REL_KINDS} style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item name="to_id" rules={[{ required: true }]}>
                    <Select placeholder="到" style={{ width: 180 }} options={products.map((p) => ({ value: p.id, label: p.name }))} />
                  </Form.Item>
                  <Form.Item name="note">
                    <Input placeholder="说明（可选）" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit">
                    添加关系
                  </Button>
                </Form>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={relations}
                  columns={[
                    { title: "从", dataIndex: "from_name" },
                    { title: "关系", dataIndex: "label", width: 100 },
                    { title: "到", dataIndex: "to_name" },
                    { title: "说明", dataIndex: "note" },
                    {
                      title: "操作",
                      width: 80,
                      render: (_: unknown, row: any) => (
                        <Popconfirm
                          title="删除关系？"
                          onConfirm={async () => {
                            await api.delete(`/api/product-relations/${row.id}`);
                            loadExtra(target!.id);
                          }}
                        >
                          <Button type="link" danger>
                            删除
                          </Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: "feat-rel",
            label: "功能关系（知识投影）",
            children: (
              <FeatureRelPanel products={products} features={features} featRels={featRels} onChange={() => loadExtra(id)} />
            ),
          },
        ]}
      />
    </Card>
    </div>
  );
}

/**
 * 功能关系只读：来自知识引用，可清理历史手工边。
 */
function FeatureRelPanel({
  features,
  featRels,
  onChange,
}: {
  products: ProductCard[];
  features: any[];
  featRels: any[];
  onChange: () => void;
}) {
  const ids = new Set(features.map((item) => item.id));
  const rows = featRels.filter((item) => ids.has(item.from_id) || ids.has(item.to_id));

  return (
    <>
      <p className="pkm-muted" style={{ marginBottom: 12 }}>
        功能之间的依赖从知识实例引用同步，不再在这里手画第二遍。跨产品拓扑请用「产品关系」。
      </p>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: "从", dataIndex: "from_name" },
          { title: "关系", dataIndex: "label", width: 100 },
          { title: "到", dataIndex: "to_name" },
          {
            title: "操作",
            width: 80,
            render: (_: unknown, row: any) => (
              <Popconfirm title="删除这条投影边？" onConfirm={async () => api.delete(`/api/feature-relations/${row.id}`).then(onChange)}>
                <Button type="link" danger>
                  删除
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </>
  );
}
