import { Button, Card, Form, Input, Select, Space, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, KnowledgeType } from "../api";

/**
 * 按对象模板调用大模型抽取候选知识。
 */
export default function ExtractPage() {
  const [types, setTypes] = useState<KnowledgeType[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/meta/types").then((res) => setTypes(res.data));
    api.get("/api/sources").then((res) => setSources(res.data));
  }, []);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="智能抽取">
        <Form
          layout="vertical"
          onFinish={async (values) => {
            setLoading(true);
            try {
              const res = await api.post("/api/extract", values);
              setResult(res.data);
            } catch (err: any) {
              message.error(err?.response?.data?.detail || "抽取失败，请检查大模型配置");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item name="type_id" label="目标对象类型" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={types.map((t) => ({
                value: t.entity_id,
                label: `${t.entity_id} ${t.model_name}/${t.name} · ${t.core_question}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="source_id" label="选择来源文档">
            <Select
              allowClear
              options={sources.map((s) => ({ value: s.id, label: `${s.title}（${s.source_type}）` }))}
            />
          </Form.Item>
          <Form.Item name="text" label="或直接粘贴文本">
            <Input.TextArea rows={8} placeholder="粘贴 PRD / 会议纪要 / 需求说明" />
          </Form.Item>
          <Form.Item name="extra_instruction" label="补充指令">
            <Input placeholder="例如：只抽取与订单履约相关的内容" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            开始抽取
          </Button>
        </Form>
      </Card>
      {result && (
        <Card
          title="抽取结果（可确认入库）"
          extra={
            <Button
              type="primary"
              onClick={async () => {
                const res = await api.post("/api/entities", {
                  type_id: result.type_id,
                  name: result.name,
                  summary: result.summary,
                  tags: result.tags,
                  payload: result.payload,
                  refs: [],
                  change_note: "来自大模型抽取",
                });
                message.success("已入库");
                navigate(`/entity/${res.data.entity.id}/edit`);
              }}
            >
              确认入库
            </Button>
          }
        >
          <p>
            名称：{result.name}　置信度：{result.confidence ?? "-"}
          </p>
          <p>摘要：{result.summary}</p>
          <p>依据：{result.evidence}</p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", padding: 12 }}>
            {JSON.stringify(result.payload, null, 2)}
          </pre>
        </Card>
      )}
    </Space>
  );
}
