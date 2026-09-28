import { Button, Card, Form, Input, Select, Space, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api, Entity, KnowledgeType } from "../api";

/**
 * 知识实例新建/编辑表单。
 */
export default function EntityEditPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [form] = Form.useForm();
  const [typeMeta, setTypeMeta] = useState<KnowledgeType | null>(null);
  const [refOptions, setRefOptions] = useState<Entity[]>([]);
  const [impact, setImpact] = useState<any>(null);
  const typeFromQuery = new URLSearchParams(location.search).get("type") || "";

  useEffect(() => {
    const boot = async () => {
      if (!isNew) {
        const res = await api.get(`/api/entities/${id}`);
        const entity: Entity = res.data.entity;
        const type: KnowledgeType = res.data.type;
        setTypeMeta(type);
        setImpact(res.data.impact);
        form.setFieldsValue({
          name: entity.name,
          summary: entity.summary,
          status: entity.status,
          tags: entity.tags,
          refs: (entity.refs || []).filter((r) => r.to_id).map((r) => r.to_id),
          ...entity.payload,
        });
        const refs = await api.get("/api/entities");
        setRefOptions(refs.data);
      } else {
        const types = await api.get("/api/meta/types");
        const type = types.data.find((t: KnowledgeType) => t.entity_id === typeFromQuery);
        setTypeMeta(type);
        form.setFieldsValue({ status: "draft", tags: type?.tags || [] });
        const refs = await api.get("/api/entities");
        setRefOptions(refs.data);
        if (typeFromQuery) {
          const impactRes = await api.get("/api/impact", { params: { type_id: typeFromQuery } });
          setImpact(impactRes.data);
        }
      }
    };
    boot();
  }, [id, isNew, typeFromQuery]);

  if (!typeMeta) {
    return null;
  }

  const allowedRefs = refOptions.filter((e) => typeMeta.ref_type_ids.length === 0 || typeMeta.ref_type_ids.includes(e.type_id));

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title={`${isNew ? "新建" : "编辑"} · ${typeMeta.model_name} / ${typeMeta.name}`}>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            const payload: Record<string, string> = {};
            typeMeta.fields.forEach((f) => {
              payload[f.key] = values[f.key] || "";
            });
            const body = {
              type_id: typeMeta.entity_id,
              name: values.name,
              summary: values.summary,
              status: values.status,
              tags: values.tags || [],
              payload,
              refs: (values.refs || []).map((to_id: number) => ({ to_id, relation: "引用" })),
              change_note: values.change_note || (isNew ? "创建" : "更新"),
            };
            try {
              if (isNew) {
                const res = await api.post("/api/entities", body);
                message.success("已创建");
                navigate(-1);
              } else {
                await api.put(`/api/entities/${id}`, body);
                message.success("已保存，版本已记录");
                navigate(-1);
              }
            } catch (err: any) {
              message.error(err?.response?.data?.detail || "保存失败");
            }
          }}
        >
          <Form.Item name="name" label="实例名称" rules={[{ required: true }]}>
            <Input placeholder="例如：订单履约、C 端注册用户" />
          </Form.Item>
          <Form.Item name="summary" label="摘要">
            <Input.TextArea rows={2} />
          </Form.Item>
          {typeMeta.fields.map((field) => (
            <Form.Item
              key={field.key}
              name={field.key}
              label={field.label}
              extra={field.fill_hint}
              rules={field.required ? [{ required: true }] : []}
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
              options={allowedRefs.map((e) => ({
                value: e.id,
                label: `${e.type_id} ${e.type_name} · ${e.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: "draft", label: "草稿" },
                { value: "published", label: "已发布" },
                { value: "deprecated", label: "已废弃" },
              ]}
            />
          </Form.Item>
          <Form.Item name="change_note" label="变更说明">
            <Input placeholder="本次为什么改" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
            <Button onClick={() => navigate(-1)}>取消</Button>
          </Space>
        </Form>
      </Card>
      {impact && (
        <Card title="变更联动提示">
          <p>{impact.change_note}</p>
          {(impact.warnings || []).map((w: string) => (
            <Tag key={w} color="gold" style={{ whiteSpace: "normal", marginBottom: 8 }}>
              {w}
            </Tag>
          ))}
          <div style={{ marginTop: 12 }}>
            {(impact.items || []).map((item: any) => (
              <Tag key={item.type_id} color={item.count ? "blue" : "default"}>
                {item.type_id} {item.type_name}（{item.count}）
              </Tag>
            ))}
          </div>
        </Card>
      )}
    </Space>
  );
}
