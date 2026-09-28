import { Button, Card, Descriptions, Popconfirm, Space, Table, Tag, Timeline, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Entity, KnowledgeType } from "../api";
import { resolveProductId, workspacePath } from "../paths";

/**
 * 知识实例详情、引用、版本与联动。
 */
export default function EntityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [typeMeta, setTypeMeta] = useState<KnowledgeType | null>(null);
  const [impact, setImpact] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);

  const load = async () => {
    const res = await api.get(`/api/entities/${id}`);
    setEntity(res.data.entity);
    setTypeMeta(res.data.type);
    setImpact(res.data.impact);
    const ver = await api.get(`/api/entities/${id}/versions`);
    setVersions(ver.data);
  };

  useEffect(() => {
    load();
  }, [id]);

  if (!entity || !typeMeta) {
    return null;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title={`${entity.type_id} ${entity.type_name} · ${entity.name}`}
        extra={
          <Space>
            <Button onClick={() => navigate(-1)}>返回</Button>
            <Button onClick={() => navigate(`/entity/${entity.id}/edit`)}>编辑</Button>
            <Popconfirm
              title="确认删除该知识实例？"
              onConfirm={async () => {
                await api.delete(`/api/entities/${entity.id}`);
                message.success("已删除");
                const pid = Number(resolveProductId() || 0);
                navigate(pid ? workspacePath(pid, `/knowledge/${entity.model_code}`) : "/products");
              }}
            >
              <Button danger>删除</Button>
            </Popconfirm>
          </Space>
        }
      >
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="所属模型">{entity.model_name}</Descriptions.Item>
          <Descriptions.Item label="知识类型">
            <Tag color={entity.knowledge_kind === "事实" ? "blue" : "gold"}>{entity.knowledge_kind}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="状态">{entity.status}</Descriptions.Item>
          <Descriptions.Item label="版本">v{entity.version}</Descriptions.Item>
          <Descriptions.Item label="摘要" span={2}>
            {entity.summary || "-"}
          </Descriptions.Item>
          {typeMeta.fields.map((field) => (
            <Descriptions.Item key={field.key} label={field.label} span={2}>
              {entity.payload?.[field.key] || "-"}
            </Descriptions.Item>
          ))}
        </Descriptions>
      </Card>
      <Card title="关联对象">
        <Table
          rowKey={(r) => `${r.to_id || r.from_id}-${r.relation}`}
          pagination={false}
          dataSource={entity.refs}
          columns={[
            { title: "方向", render: (_, r) => (r.direction === "in" ? "被引用" : "引用") },
            { title: "对象", render: (_, r) => r.to_name || r.from_name },
            { title: "类型", render: (_, r) => r.to_type_id || r.from_type_id },
            { title: "关系", dataIndex: "relation" },
            {
              title: "操作",
              render: (_, r) => {
                const target = r.to_id || r.from_id;
                return target ? (
                  <Button type="link" onClick={() => navigate(`/entity/${target}`)}>
                    查看
                  </Button>
                ) : null;
              },
            },
          ]}
        />
      </Card>
      <Card title="变更联动">
        <p>{impact?.change_note}</p>
        {(impact?.items || []).map((item: any) => (
          <Tag key={item.type_id}>
            {item.type_id} {item.type_name} · {item.count} 条
          </Tag>
        ))}
      </Card>
      <Card title="版本历史">
        <Timeline
          items={versions.map((v) => ({
            children: (
              <div>
                <b>v{v.version}</b> {v.change_note} · {v.changed_by}
                <div style={{ color: "#888" }}>{v.created_at}</div>
                <Button
                  type="link"
                  size="small"
                  onClick={async () => {
                    await api.post(`/api/entities/${id}/rollback`, { version: v.version, change_note: `回滚到 v${v.version}` });
                    message.success("已回滚");
                    load();
                  }}
                >
                  回滚到此版本
                </Button>
              </div>
            ),
          }))}
        />
      </Card>
    </Space>
  );
}
