import { Card, Table } from "antd";
import { useEffect, useState } from "react";
import { api, Entity } from "../api";
import GovernanceTag from "../components/GovernanceTag";
import { useWorkspace } from "../workspace";

/**
 * 最近变更与版本入口。
 */
export default function ChangesPage() {
  const [rows, setRows] = useState<Entity[]>([]);
  const { openEntity } = useWorkspace();

  useEffect(() => {
    api.get("/api/entities").then((res) => setRows(res.data));
    const reload = () => api.get("/api/entities").then((res) => setRows(res.data));
    window.addEventListener("pkm-refresh", reload);
    return () => window.removeEventListener("pkm-refresh", reload);
  }, []);

  return (
    <Card title="变更与版本">
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: "实例", dataIndex: "name" },
          { title: "对象", render: (_, r) => `${r.type_id} ${r.type_name}` },
          { title: "模型", dataIndex: "model_name" },
          { title: "治理", render: (_, r) => <GovernanceTag stage={r.stage} completeness={r.completeness} /> },
          { title: "版本", dataIndex: "version" },
          { title: "更新人", dataIndex: "updated_by" },
          { title: "更新时间", dataIndex: "updated_at" },
          {
            title: "操作",
            render: (_, r) => (
              <a onClick={() => openEntity({ mode: "view", id: r.id })}>查看</a>
            ),
          },
        ]}
      />
    </Card>
  );
}
