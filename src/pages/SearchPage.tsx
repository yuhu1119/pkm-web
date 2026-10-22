import { Form, Input, List, Tag } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, Entity, KnowledgeType } from "../api";
import GovernanceTag from "../components/GovernanceTag";
import { QueryForm, ResultTable } from "../components/SearchTable";
import { workspacePath } from "../paths";
import { useProduct } from "../product";
import { useWorkspace } from "../workspace";

/**
 * 关键词与核心问句检索，交互对齐查询表格。
 */
export default function SearchPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [types, setTypes] = useState<KnowledgeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { current } = useProduct();
  const { openEntity } = useWorkspace();
  const preset = params.get("q") || "";
  const base = current?.id ? workspacePath(current.id) : "/products";

  /**
   * 按关键词检索，页码回到第一页。
   * @param {string} [q]
   */
  const run = async (q?: string) => {
    const keyword = (q ?? form.getFieldValue("q") ?? "").trim();
    if (!keyword) {
      setEntities([]);
      setTypes([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get("/api/search", { params: { q: keyword } });
      setEntities(res.data.entities);
      setTypes(res.data.types);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (preset) {
      form.setFieldsValue({ q: preset });
      run(preset);
    }
  }, [preset]);

  return (
    <div className="pkm-search-stack">
      <QueryForm
        form={form}
        loading={loading}
        onSearch={() => run()}
        onReset={() => {
          form.resetFields();
          setEntities([]);
          setTypes([]);
        }}
      >
        <Form.Item name="q" label="关键词">
          <Input allowClear placeholder="请输入关键词或核心问句" />
        </Form.Item>
      </QueryForm>
      {types.length > 0 ? (
        <List
          header="匹配到的对象类型 / 核心问句"
          style={{ marginBottom: 16, background: "var(--pkm-bg)", border: "1px solid var(--pkm-border)", borderRadius: 4, padding: "0 16px 8px" }}
          dataSource={types}
          renderItem={(t) => (
            <List.Item
              style={{ cursor: "pointer" }}
              onClick={() => navigate(`${base}/knowledge/${t.model_code}?type=${t.entity_id}`)}
            >
              <Tag>{t.entity_id}</Tag>
              {t.model_name} / {t.name} · {t.core_question}
            </List.Item>
          )}
        />
      ) : null}
      <ResultTable<Entity>
        rowKey="id"
        loading={loading}
        dataSource={entities}
        locale={{ emptyText: "输入关键词后点查询。" }}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "对象", dataIndex: "type_name", render: (_, r) => `${r.type_id} ${r.type_name}` },
          { title: "治理", dataIndex: "stage", render: (_, r) => <GovernanceTag stage={r.stage} completeness={r.completeness} /> },
          { title: "摘要", dataIndex: "summary", ellipsis: true },
          {
            title: "操作",
            key: "operations",
            hideable: false,
            render: (_, r) => (
              <a onClick={() => openEntity({ mode: "view", id: r.id, typeId: r.type_id })}>查看</a>
            ),
          },
        ]}
      />
    </div>
  );
}
