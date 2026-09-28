import { Button, Card, Form, Input, Modal, Popconfirm, Select, Table, message } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { workspacePath } from "../paths";
import { useProduct, type ProductCard } from "../product";

const INIT_OPTIONS = [
  { value: "empty", label: "空白知识空间（不写入示例）" },
  { value: "demo", label: "写入爱导购示例知识" },
  { value: "wuxing", label: "写入五星经营门户示例知识" },
  { value: "copy", label: "从其他产品复制知识" },
];

/**
 * 产品管理：点击行进入知识概览；操作进入治理、编辑或删除。
 */
export default function ProductsPage() {
  const { products, setCurrentId, reload } = useProduct();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCard | null>(null);
  const [form] = Form.useForm();

  /**
   * 进入该产品知识概览。
   * @param {ProductCard} row
   */
  const openOverview = (row: ProductCard) => {
    setCurrentId(row.id);
    navigate(workspacePath(row.id, "/overview"));
  };

  /**
   * 新建或更新产品。
   */
  const saveProduct = async (values: any) => {
    if (editing) {
      await api.put(`/api/products/${editing.id}`, values);
      message.success("产品已更新");
    } else {
      const res = await api.post("/api/products", values);
      message.success("产品已创建");
      if (res.data.product?.id) setCurrentId(res.data.product.id);
    }
    setOpen(false);
    setEditing(null);
    form.resetFields();
    await reload();
  };

  return (
    <div>
      <div className="pkm-page-kicker">Workspace</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="pkm-page-title" style={{ marginTop: 6 }}>
            产品
          </h1>
          <p className="pkm-page-desc">点击产品进入知识概览。功能与关系、知识图谱在该产品工作台内维护。</p>
        </div>
        <Button
          type="primary"
          onClick={() => {
            setEditing(null);
            form.resetFields();
            form.setFieldsValue({ init_mode: "empty", status: "active" });
            setOpen(true);
          }}
        >
          新建产品
        </Button>
      </div>
      <Card>
        <Table
          rowKey="id"
          className="pkm-products-table"
          tableLayout="fixed"
          dataSource={products}
          pagination={false}
          onRow={(row) => ({
            onClick: () => openOverview(row),
            style: { cursor: "pointer" },
          })}
          columns={[
            { title: "产品", dataIndex: "name", ellipsis: true },
            { title: "编码", dataIndex: "code", width: 112, render: (v) => v || "-" },
            { title: "负责人", dataIndex: "owner", width: 140, ellipsis: true, render: (v) => v || "-" },
            { title: "知识实例", dataIndex: "entity_count", width: 88, align: "right" },
            { title: "已治理类", dataIndex: "governed_types", width: 88, align: "right" },
            { title: "功能细分", dataIndex: "feature_count", width: 88, align: "right" },
            {
              title: "操作",
              width: 268,
              align: "right",
              render: (_: unknown, row: ProductCard) => (
                <div className="pkm-products-ops" onClick={(event) => event.stopPropagation()}>
                  <Button
                    type="link"
                    onClick={() => {
                      setCurrentId(row.id);
                      navigate(workspacePath(row.id, "/knowledge/1"));
                    }}
                  >
                    进入知识管理
                  </Button>
                  <Button
                    type="link"
                    onClick={() => {
                      setEditing(row);
                      form.setFieldsValue(row);
                      setOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="删除该产品及其全部知识和关系？此操作不可恢复。"
                    onConfirm={async () => {
                      try {
                        await api.delete(`/api/products/${row.id}`);
                        message.success("产品已删除");
                        await reload();
                      } catch (err: any) {
                        message.error(err?.response?.data?.detail || "删除失败");
                      }
                    }}
                  >
                    <Button type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? "编辑产品" : "新建产品"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={saveProduct}>
          <Form.Item name="name" label="产品名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="产品编码">
            <Input placeholder="如 AIDG" />
          </Form.Item>
          <Form.Item name="owner" label="负责人">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="产品说明">
            <Input.TextArea rows={3} />
          </Form.Item>
          {!editing ? (
            <>
              <Form.Item name="init_mode" label="初始化知识" extra="可选爱导购或五星经营门户示例，知识只写入当前产品。">
                <Select options={INIT_OPTIONS} />
              </Form.Item>
              <Form.Item noStyle shouldUpdate>
                {() =>
                  form.getFieldValue("init_mode") === "copy" ? (
                    <Form.Item name="copy_from_id" label="复制来源" rules={[{ required: true }]}>
                      <Select options={products.map((p) => ({ value: p.id, label: p.name }))} />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </>
          ) : null}
        </Form>
      </Modal>
    </div>
  );
}
