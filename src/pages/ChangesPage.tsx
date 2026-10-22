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
        className="pkm-data-table"
        tableLayout="fixed"
        scroll={{ x: 880 }}
        dataSource={rows}
        columns={[
          { title: "实例", dataIndex: "name", ellipsis: true },
          { title: "对象", ellipsis: true, render: (_, r) => `${r.type_id} ${r.type_name}` },
          { title: "模型", dataIndex: "model_name", width: 120, ellipsis: true },
          { title: "治理", width: 140, render: (_, r) => <GovernanceTag stage={r.stage} completeness={r.completeness} /> },
          { title: "版本", dataIndex: "version", width: 72 },
          { title: "更新人", dataIndex: "updated_by", width: 90, ellipsis: true },
          { title: "更新时间", dataIndex: "updated_at", width: 160, ellipsis: true },
          {
            title: "操作",
            width: 72,
            align: "right",
            className: "pkm-table-ops-cell",
            render: (_, r) => (
              <div className="pkm-table-ops">
                <a onClick={() => openEntity({ mode: "view", id: r.id })}>查看</a>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}
