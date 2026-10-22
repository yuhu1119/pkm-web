import { CloudSyncOutlined, ExperimentOutlined, PartitionOutlined } from "@ant-design/icons";
import { Button, Space, Tag } from "antd";
import { ResultTable } from "../components/SearchTable";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import GovernanceTag from "../components/GovernanceTag";
import { workspacePath } from "../paths";
import { useProduct } from "../product";

interface Coverage {
  model_code: number;
  model_name: string;
  type_total: number;
  type_filled: number;
  type_sourced?: number;
  type_extracted?: number;
  type_incomplete?: number;
  entity_count: number;
}

/**
 * 单个产品的知识概览：覆盖率、治理管道与入口。
 */
export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const navigate = useNavigate();
  const { current } = useProduct();
  const base = current?.id ? workspacePath(current.id) : "/products";

  const load = () => {
    api
      .get("/api/dashboard")
      .then((res) => setData(res.data))
      .catch(() => setData({ product: current || { name: "产品" }, coverage: [], type_total: 0, type_governed: 0, type_incomplete: 0, type_extracted: 0, type_sourced: 0, entity_total: 0 }));
    api
      .get("/api/entities", { params: { limit: 8 } })
      .then((res) => setRecent((res.data || []).slice(0, 8)))
      .catch(() => setRecent([]));
  };

  useEffect(() => {
    load();
    window.addEventListener("pkm-refresh", load);
    return () => window.removeEventListener("pkm-refresh", load);
  }, [current?.id]);

  if (!data) {
    return null;
  }

  const tiles = [
    {
      path: `${base}/sources`,
      title: "知识收集",
      desc: "一次上传多篇资料，勾选后整库分析。知识库有内容后，新文档点「更新知识库」只改相关对象。",
      icon: <CloudSyncOutlined />,
    },
    {
      path: `${base}/knowledge/1`,
      title: "知识治理",
      desc: "按对象类型维护实例：核对抽取、补全必填并发布。这是产品知识的主工作台。",
      icon: <PartitionOutlined />,
    },
    {
      path: `${base}/pack`,
      title: "投喂预览",
      desc: "核对已治理知识拼给模型的输入，并试问命中切片。",
      icon: <ExperimentOutlined />,
    },
  ];

  return (
    <div>
      <div className="pkm-page-kicker">Overview</div>
      <h1 className="pkm-page-title">{data.product.name}</h1>
      <p className="pkm-page-desc">
        {data.product.description || "收集产品资料并由 AI 写入草稿，在知识治理中发布后可投喂与问答。"}
      </p>

      <div className="pkm-kpi-row">
        <div className="pkm-kpi">
          <b>{`${data.type_governed ?? data.type_filled}/${data.type_total}`}</b>
          <span>已治理</span>
        </div>
        <div className="pkm-kpi">
          <b>{data.type_incomplete || 0}</b>
          <span>结构不完整</span>
        </div>
        <div className="pkm-kpi">
          <b>{data.type_extracted || 0}</b>
          <span>已抽取待治理</span>
        </div>
        <div className="pkm-kpi">
          <b>{data.type_sourced || 0}</b>
          <span>已挂来源</span>
        </div>
        <div className="pkm-kpi">
          <b>{data.type_ungoverned || 0}</b>
          <span>未治理</span>
        </div>
        <div className="pkm-kpi">
          <b>{data.entity_total}</b>
          <span>知识实例</span>
        </div>
      </div>

      <div className="pkm-section-title">开始治理</div>
      <div className="pkm-tile-grid">
        {tiles.map((item) => (
          <button key={item.path} type="button" className="pkm-tile" onClick={() => navigate(item.path)}>
            <span className="pkm-tile-icon">{item.icon}</span>
            <strong>{item.title}</strong>
            <p>{item.desc}</p>
          </button>
        ))}
      </div>

      <div className="pkm-section-title">十模型覆盖率</div>
      <ResultTable<Coverage>
          rowKey="model_code"
          showIndex={false}
          pagination={false}
          dataSource={data.coverage as Coverage[]}
          columns={[
            { title: "模型", dataIndex: "model_name" },
            {
              title: "已治理",
              render: (_, row) => (
                <div>
                  <div className="coverage-bar">
                    <span style={{ width: `${(row.type_filled / row.type_total) * 100}%` }} />
                  </div>
                  <div className="pkm-muted" style={{ marginTop: 6 }}>
                    {row.type_filled}/{row.type_total}
                  </div>
                </div>
              ),
            },
            {
              title: "管道",
              render: (_, row) => (
                <Space size={4} wrap>
                  {(row.type_incomplete || 0) > 0 && <Tag color="gold">不完整 {row.type_incomplete}</Tag>}
                  {(row.type_extracted || 0) > 0 && <Tag color="cyan">已抽取 {row.type_extracted}</Tag>}
                  {(row.type_sourced || 0) > 0 && <Tag>已挂来源 {row.type_sourced}</Tag>}
                </Space>
              ),
            },
            { title: "实例数", dataIndex: "entity_count" },
            {
              title: "状态",
              render: (_, row) =>
                row.type_filled === row.type_total ? <GovernanceTag stage="governed" /> : <Tag>治理中</Tag>,
            },
            {
              title: "操作",
              key: "operations",
              hideable: false,
              render: (_, row) => (
                <Button type="link" onClick={() => navigate(`${base}/knowledge/${row.model_code}`)}>
                  查看
                </Button>
              ),
            },
          ]}
        />

      <div className="pkm-section-title">最近更新</div>
      <ResultTable
          rowKey="id"
          dataSource={recent}
          columns={[
            { title: "实例", dataIndex: "name" },
            { title: "对象", render: (_: any, r: any) => `${r.type_id} ${r.type_name}` },
            { title: "治理", render: (_: any, r: any) => <GovernanceTag stage={r.stage} completeness={r.completeness} /> },
            { title: "更新人", dataIndex: "updated_by" },
            { title: "时间", dataIndex: "updated_at" },
          ]}
        />
    </div>
  );
}
