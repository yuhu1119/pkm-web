import { Card, Input, Select, Space, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api";

const ACTION_META: Record<string, { label: string; color: string }> = {
  login: { label: "登录", color: "green" },
  login_failed: { label: "登录失败", color: "red" },
  logout: { label: "退出", color: "default" },
  visit: { label: "访问", color: "blue" },
  create: { label: "新建", color: "green" },
  update: { label: "修改", color: "orange" },
  delete: { label: "删除", color: "red" },
  export: { label: "导出", color: "purple" },
  ask: { label: "问答", color: "cyan" },
  other: { label: "操作", color: "default" },
};

interface AuditRow {
  id: number;
  created_at: string;
  username: string;
  display_name: string;
  role: string;
  action: string;
  category: string;
  resource: string;
  summary: string;
  path: string;
  status_code: number;
  ip: string;
}

/**
 * 把 UTC 时间格式化为本地可读时间。
 * @param {string} value
 */
function formatTime(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 系统日志列表：仅管理员在系统设置中查看。
 */
export default function AuditLogsPanel() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>();
  const [username, setUsername] = useState("");

  /**
   * 拉取日志分页。
   * @param {number} nextPage
   */
  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const res = await api.get("/api/audit-logs", {
        params: { q: q || undefined, action: action || undefined, username: username || undefined, page: nextPage, page_size: 20 },
      });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      setPage(res.data.page || nextPage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, [action]);

  return (
    <Card>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="搜索操作说明或对象"
          style={{ width: 240 }}
          onSearch={() => load(1)}
          onChange={(e) => setQ(e.target.value)}
        />
        <Input
          allowClear
          placeholder="用户名或姓名"
          style={{ width: 160 }}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onPressEnter={() => load(1)}
        />
        <Select
          allowClear
          placeholder="操作类型"
          style={{ width: 140 }}
          value={action}
          onChange={(value) => setAction(value)}
          options={Object.entries(ACTION_META).map(([value, item]) => ({ value, label: item.label }))}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          showSizeChanger: false,
          showTotal: (count) => `共 ${count} 条`,
          onChange: (next) => load(next),
        }}
        columns={[
          { title: "时间", dataIndex: "created_at", width: 180, render: (v: string) => formatTime(v) },
          {
            title: "用户",
            width: 180,
            render: (_: unknown, row: AuditRow) => (
              <span>
                {row.display_name || row.username || "未登录"}
                {row.username ? <span className="pkm-muted"> · {row.username}</span> : null}
              </span>
            ),
          },
          {
            title: "操作",
            dataIndex: "action",
            width: 100,
            render: (value: string) => {
              const meta = ACTION_META[value] || ACTION_META.other;
              return <Tag color={meta.color}>{meta.label}</Tag>;
            },
          },
          { title: "模块", dataIndex: "category", width: 80 },
          { title: "对象", dataIndex: "resource", ellipsis: true },
          { title: "说明", dataIndex: "summary", ellipsis: true },
          { title: "IP", dataIndex: "ip", width: 130, render: (v: string) => v || "-" },
        ]}
      />
    </Card>
  );
}
