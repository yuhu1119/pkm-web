import { Card, Input, List, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, Entity, KnowledgeType } from "../api";
import GovernanceTag from "../components/GovernanceTag";
import { workspacePath } from "../paths";
import { useProduct } from "../product";
import { useWorkspace } from "../workspace";

/**
 * 关键词与核心问句检索。
 */
export default function SearchPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [types, setTypes] = useState<KnowledgeType[]>([]);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { current } = useProduct();
  const { openEntity } = useWorkspace();
  const preset = params.get("q") || "";
  const base = current?.id ? workspacePath(current.id) : "/products";

  const run = async (q: string) => {
    if (!q) return;
    const res = await api.get("/api/search", { params: { q } });
    setEntities(res.data.entities);
    setTypes(res.data.types);
  };

  useEffect(() => {
    if (preset) run(preset);
  }, [preset]);

  return (
    <div>
      <div className="pkm-page-kicker">Search</div>
      <h1 className="pkm-page-title">检索</h1>
      <p className="pkm-page-desc">在本产品已录入知识中按关键词或核心问句查找。</p>
      <Card style={{ marginTop: 20 }}>
      <Input.Search
        size="large"
        defaultValue={preset}
        placeholder="输入关键词或核心问句"
        onSearch={run}
      />
      {types.length > 0 && (
        <List
          header="匹配到的对象类型 / 核心问句"
          style={{ marginTop: 16 }}
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
      )}
      <Table
        style={{ marginTop: 16 }}
        rowKey="id"
        dataSource={entities}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "对象", render: (_, r) => `${r.type_id} ${r.type_name}` },
          { title: "治理", render: (_, r) => <GovernanceTag stage={r.stage} completeness={r.completeness} /> },
          { title: "摘要", dataIndex: "summary", ellipsis: true },
          {
            title: "操作",
            render: (_, r) => <a onClick={() => openEntity({ mode: "view", id: r.id, typeId: r.type_id })}>打开</a>,
          },
        ]}
      />
    </Card>
    </div>
  );
}
