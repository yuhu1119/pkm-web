import { Alert, Button, Card, Form, Input, Select, Switch, Table, Tabs, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { api, UserInfo } from "../api";
import { useAuth } from "../auth";
import AuditLogsPanel from "./AuditLogsPanel";

const MODEL_NAMES = [
  "产品基准",
  "模块模型",
  "对象与数据",
  "业务流程",
  "状态与规则",
  "权限模型",
  "系统关系",
  "约束模型",
  "用户与业务",
  "决策与演进",
];

/**
 * 产品信息已迁至产品管理；此处维护连接器、大模型与用户权限。
 */
export default function SettingsPage() {
  const { user } = useAuth();
  const [llmForm] = Form.useForm();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmProbe, setLlmProbe] = useState<{ ok: boolean; model?: string; latency_ms?: number; reply?: string; error?: string } | null>(null);

  /**
   * 保存连接配置，并向 chat/completions 发一条短对话验证大模型是否可用。
   */
  const saveLlmSettings = async (values: Record<string, unknown>) => {
    setSavingLlm(true);
    try {
      const res = await api.put("/api/settings", values);
      const probe = res.data.llm_probe;
      setLlmProbe(probe);
      if (probe?.ok) {
        message.success(`配置已保存，大模型可用（${probe.latency_ms}ms）`);
      } else {
        message.error(probe?.error || "配置已保存，但大模型验证未通过");
      }
    } catch (err: any) {
      setLlmProbe({ ok: false, error: err?.response?.data?.detail || "仅管理员可修改" });
      message.error(err?.response?.data?.detail || "仅管理员可修改");
    } finally {
      setSavingLlm(false);
    }
  };

  useEffect(() => {
    api.get("/api/settings").then((res) =>
      llmForm.setFieldsValue({ ...res.data, browser_fetch_enabled: res.data.browser_fetch_enabled === "true" }),
    );
    if (user?.role === "admin") {
      api.get("/api/users").then((res) => setUsers(res.data));
    }
  }, [user]);

  return (
    <div>
      <div className="pkm-page-kicker">Settings</div>
      <h1 className="pkm-page-title">系统设置</h1>
      <p className="pkm-page-desc">维护大模型连接和用户权限。登录走平台 SSO，用户在首次访问时自动建档。解析技能请到「技能配置」。</p>
      <Tabs
        style={{ marginTop: 20 }}
        items={[
        {
          key: "llm",
          label: "大模型与文档连接",
          children: (
            <Card>
              <Form
                form={llmForm}
                layout="vertical"
                onFinish={saveLlmSettings}
              >
                {llmProbe ? (
                  <Alert
                    style={{ marginBottom: 16 }}
                    type={llmProbe.ok ? "success" : "error"}
                    showIcon
                    message={llmProbe.ok ? "大模型配置可用" : "大模型配置不可用"}
                    description={
                      llmProbe.ok
                        ? `已连通 ${llmProbe.model}，耗时 ${llmProbe.latency_ms}ms${llmProbe.reply ? `，回复「${llmProbe.reply}」` : ""}。抽取功能可以使用。`
                        : llmProbe.error
                    }
                  />
                ) : (
                  <Alert style={{ marginBottom: 16 }} type="info" showIcon message="保存时会向该接口发送一条短对话，确认抽取链路可用。" />
                )}
                <Form.Item name="llm_provider" label="提供方">
                  <Select
                    options={[
                      { value: "openai_compat", label: "OpenAI 兼容（含本地 Ollama / vLLM）" },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="llm_base_url" label="Base URL" extra="需包含 /v1，例如 http://127.0.0.1:11434/v1">
                  <Input placeholder="http://127.0.0.1:11434/v1 或 https://api.deepseek.com/v1" />
                </Form.Item>
                <Form.Item name="llm_model" label="模型名">
                  <Input placeholder="qwen2.5 / deepseek-chat" />
                </Form.Item>
                <Form.Item name="llm_api_key" label="API Key">
                  <Input.Password />
                </Form.Item>
                <Form.Item name="feishu_app_id" label="飞书 App ID">
                  <Input />
                </Form.Item>
                <Form.Item name="feishu_app_secret" label="飞书 App Secret">
                  <Input.Password />
                </Form.Item>
                <Form.Item name="feishu_user_access_token" label="飞书 user_access_token（可选）">
                  <Input.Password />
                </Form.Item>
                <Form.Item name="joyspace_cookie" label="JoySpace / 本机登录 Cookie">
                  <Input.TextArea rows={3} placeholder="从浏览器开发者工具复制 Cookie，用于抓取已登录文档" />
                </Form.Item>
                <Form.Item name="browser_fetch_enabled" label="启用浏览器抓取兜底" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={savingLlm}>
                  保存并验证大模型
                </Button>
              </Form>
            </Card>
          ),
        },
        {
          key: "users",
          label: "用户与模型权限",
          children:
            user?.role === "admin" ? (
              <Card>
                <Table
                  rowKey="id"
                  pagination={false}
                  dataSource={users}
                  columns={[
                    { title: "账号", dataIndex: "username" },
                    { title: "姓名", dataIndex: "display_name" },
                    { title: "角色", dataIndex: "role" },
                    {
                      title: "可写模型",
                      render: (_, row) =>
                        MODEL_NAMES.map((name, idx) => {
                          const code = String(idx + 1);
                          const perm = row.model_permissions?.[code];
                          return (
                            <Tag
                              key={code}
                              color={perm?.can_write ? "blue" : "default"}
                              style={{ cursor: "pointer", marginBottom: 4 }}
                              onClick={async () => {
                                try {
                                  const next = { ...(row.model_permissions || {}) };
                                  const current = next[code] || { can_read: true, can_write: false };
                                  next[code] = { can_read: true, can_write: !current.can_write };
                                  await api.put(`/api/users/${row.id}`, { model_permissions: next });
                                  const res = await api.get("/api/users");
                                  setUsers(res.data);
                                } catch (err: any) {
                                  message.error(err?.response?.data?.detail || "权限更新失败");
                                }
                              }}
                            >
                              {name}
                            </Tag>
                          );
                        }),
                    },
                  ]}
                />
              </Card>
            ) : (
              <Card>仅管理员可维护用户权限。</Card>
            ),
        },
        ...(user?.role === "admin"
          ? [
              {
                key: "audit",
                label: "系统日志",
                children: <AuditLogsPanel />,
              },
            ]
          : []),
      ]}
    />
    </div>
  );
}
