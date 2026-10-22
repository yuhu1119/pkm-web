import { Alert, Button, Form, Input, Modal, Popconfirm, Select, message } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { CAP_HINTS, canMutate, hasCap, isProductOnline, useAuth } from "../auth";
import CapAction from "../components/CapAction";
import { QueryForm, ResultTable } from "../components/SearchTable";
import { workspacePath } from "../paths";
import { useProduct, type ProductCard } from "../product";

const INIT_OPTIONS = [
  { value: "empty", label: "空白知识空间（不写入示例）" },
  { value: "demo", label: "写入爱导购示例知识" },
  { value: "wuxing", label: "写入五星经营门户示例知识" },
  { value: "copy", label: "从其他产品复制知识" },
];

/**
 * 产品管理：查询表格筛选后进入知识概览；操作进入治理、编辑或删除。
 */
export default function ProductsPage() {
  const { products, error, setCurrentId, reload } = useProduct();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCard | null>(null);
  const [form] = Form.useForm();
  const [queryForm] = Form.useForm();
  const [filters, setFilters] = useState({ name: "", code: "", owner: "" });

  /**
   * 进入该产品知识概览。
   * @param {ProductCard} row
   */
  const openOverview = (row: ProductCard) => {
    setCurrentId(row.id);
    navigate(workspacePath(row.id, "/overview"));
  };

  /**
   * 应用查询条件并回到第一页。
   */
  const search = () => {
    setFilters({
      name: String(queryForm.getFieldValue("name") || "").trim(),
      code: String(queryForm.getFieldValue("code") || "").trim(),
      owner: String(queryForm.getFieldValue("owner") || "").trim(),
    });
  };

  /**
   * 清空条件后立刻按空条件重查。
   */
  const reset = () => {
    queryForm.resetFields();
    setFilters({ name: "", code: "", owner: "" });
  };

  const rows = useMemo(() => {
    return products.filter((item) => {
      if (filters.name && !item.name?.includes(filters.name)) return false;
      if (filters.code && !(item.code || "").includes(filters.code)) return false;
      if (filters.owner && !(item.owner || "").includes(filters.owner)) return false;
      return true;
    });
  }, [products, filters]);

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
    <div className="pkm-search-stack">
      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="产品列表加载失败"
          description={error}
        />
      ) : null}
      <QueryForm form={queryForm} onSearch={search} onReset={reset}>
        <Form.Item name="name" label="产品名称">
          <Input allowClear placeholder="请输入产品名称" />
        </Form.Item>
        <Form.Item name="code" label="产品编码">
          <Input allowClear placeholder="请输入产品编码" />
        </Form.Item>
        <Form.Item name="owner" label="负责人">
          <Input allowClear placeholder="请输入负责人" />
        </Form.Item>
      </QueryForm>

      <ResultTable<ProductCard>
        rowKey="id"
        className="pkm-products-table"
        dataSource={rows}
        locale={{
          emptyText: error
            ? "产品列表暂时无法读取"
            : hasCap(user, "product_create")
              ? "还没有产品，可新建"
              : "还没有在线产品",
        }}
        onRefresh={() => {
          reload().catch(() => undefined);
        }}
        onRow={(row) => ({
          onClick: () => openOverview(row),
          style: { cursor: "pointer" },
        })}
        operations={
          <CapAction allowed={hasCap(user, "product_create")} hint={CAP_HINTS.product_create}>
            <Button
              type="primary"
              onClick={() => {
                setEditing(null);
                form.resetFields();
                form.setFieldsValue({ init_mode: "empty", status: "active" });
                setOpen(true);
              }}
            >
              新建
            </Button>
          </CapAction>
        }
        columns={[
          { title: "产品", dataIndex: "name", ellipsis: true },
          { title: "编码", dataIndex: "code", render: (v) => v || "-" },
          { title: "负责人", dataIndex: "owner", ellipsis: true, render: (v) => v || "-" },
          { title: "知识实例", dataIndex: "entity_count", align: "right" },
          { title: "已治理类", dataIndex: "governed_types", align: "right" },
          { title: "功能细分", dataIndex: "feature_count", align: "right" },
          {
            title: "状态",
            width: 88,
            render: (_: unknown, row: ProductCard) =>
              isProductOnline(row) ? <span>在线</span> : <span className="pkm-muted">已下架</span>,
          },
          {
            title: "操作",
            key: "operations",
            hideable: false,
            render: (_: unknown, row: ProductCard) => (
              <div className="pkm-products-ops" onClick={(event) => event.stopPropagation()}>
                <Button type="link" onClick={() => openOverview(row)}>
                  查看
                </Button>
                <Button
                  type="link"
                  onClick={() => {
                    setCurrentId(row.id);
                    navigate(workspacePath(row.id, "/knowledge/1"));
                  }}
                >
                  进入治理
                </Button>
                {canMutate(user, row.created_by, "product_edit_own", "product_edit_others") ? (
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
                ) : null}
                {canMutate(user, row.created_by, "product_edit_own", "product_edit_others") ? (
                  <Popconfirm
                    title={isProductOnline(row) ? "下架后，未维护该产品的人将看不到它。" : "上线后，所有已开通账号都能看到该产品。"}
                    onConfirm={async () => {
                      try {
                        await api.put(`/api/products/${row.id}`, { status: isProductOnline(row) ? "offline" : "active" });
                        message.success(isProductOnline(row) ? "产品已下架" : "产品已上线");
                        await reload();
                      } catch (err: any) {
                        message.error(err?.response?.data?.detail || "更新失败");
                      }
                    }}
                  >
                    <Button type="link">{isProductOnline(row) ? "下架" : "上线"}</Button>
                  </Popconfirm>
                ) : null}
                {canMutate(user, row.created_by, "product_delete_own", "product_delete_others") ? (
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
                ) : null}
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? "编辑产品" : "新建产品"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={saveProduct}>
          <Form.Item name="name" label="产品名称" rules={[{ required: true, message: "请输入产品名称" }]}>
            <Input placeholder="请输入产品名称" />
          </Form.Item>
          <Form.Item name="code" label="产品编码">
            <Input placeholder="如 AIDG" />
          </Form.Item>
          <Form.Item name="owner" label="负责人">
            <Input placeholder="请输入负责人" />
          </Form.Item>
          <Form.Item name="description" label="产品说明">
            <Input.TextArea rows={3} placeholder="请输入产品说明" />
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
