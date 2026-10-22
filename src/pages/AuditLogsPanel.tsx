import { Form, Input, Select, Tag } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api";
import { QueryForm, ResultTable } from "../components/SearchTable";

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
 * 展示时间。SQLite / now_str 的「2026-10-13 15:20:02」已是本地文本，不能再当 UTC。
 * 带 Z 或 T 的 ISO 按 UTC 转成本地。
 * @param {string} value
 */
function formatTime(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (/^\d{4}-\d{2}-\d{2} /.test(raw) && !/[zZ]$/.test(raw) && !/[+-]\d{2}:?\d{2}$/.test(raw)) {
    return raw.slice(0, 19);
  }
  const date = new Date(/[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(date.getTime())) return raw;
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
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({ q: "", action: undefined as string | undefined, username: "" });

  /**
   * 拉取日志分页，切页保留当前筛选。
   * @param {number} nextPage
   * @param {number} [nextSize]
   */
  const load = async (nextPage = page, nextSize = pageSize, nextFilters = filters) => {
    setLoading(true);
    try {
      const res = await api.get("/api/audit-logs", {
        params: {
          q: nextFilters.q || undefined,
          action: nextFilters.action || undefined,
          username: nextFilters.username || undefined,
          page: nextPage,
          page_size: nextSize,
        },
      });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      setPage(res.data.page || nextPage);
      setPageSize(nextSize);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  /**
   * 查询：带条件回到第 1 页。
   */
  const search = () => {
    const next = {
      q: String(form.getFieldValue("q") || "").trim(),
      username: String(form.getFieldValue("username") || "").trim(),
      action: form.getFieldValue("action") || undefined,
    };
    setFilters(next);
    load(1, pageSize, next);
  };

  /**
   * 重置后立刻按空条件重查。
   */
  const reset = () => {
    form.resetFields();
    const next = { q: "", action: undefined as string | undefined, username: "" };
    setFilters(next);
    load(1, pageSize, next);
  };

  return (
    <div className="pkm-search-stack">
      <QueryForm form={form} loading={loading} onSearch={search} onReset={reset}>
        <Form.Item name="q" label="说明">
          <Input allowClear placeholder="请输入操作说明或对象" />
        </Form.Item>
        <Form.Item name="username" label="用户">
          <Input allowClear placeholder="请输入用户名或姓名" />
        </Form.Item>
        <Form.Item name="action" label="操作类型">
          <Select
            allowClear
            placeholder="全部"
            options={Object.entries(ACTION_META).map(([value, item]) => ({ value, label: item.label }))}
          />
        </Form.Item>
      </QueryForm>
      <ResultTable<AuditRow>
        rowKey="id"
        loading={loading}
        dataSource={items}
        onRefresh={() => load(page, pageSize)}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: (next, size) => load(next, size || pageSize),
        }}
        columns={[
          { title: "时间", dataIndex: "created_at", width: 180, render: (v: string) => formatTime(v) },
          {
            title: "用户",
            dataIndex: "username",
            width: 180,
            render: (_: unknown, row: AuditRow) => (
              <span>
                {row.display_name || row.username || "未登录"}
                {row.username ? <span className="pkm-muted"> · {row.username}</span> : null}
              </span>
            ),
          },
          {
            title: "操作类型",
            dataIndex: "action",
            width: 110,
            render: (value: string) => {
              const meta = ACTION_META[value] || ACTION_META.other;
              return <Tag color={meta.color}>{meta.label}</Tag>;
            },
          },
          { title: "模块", dataIndex: "category", width: 88 },
          { title: "对象", dataIndex: "resource", width: 160, ellipsis: true },
          { title: "说明", dataIndex: "summary", width: 240, ellipsis: true },
          { title: "IP", dataIndex: "ip", width: 130, render: (v: string) => v || "-" },
        ]}
      />
    </div>
  );
}
