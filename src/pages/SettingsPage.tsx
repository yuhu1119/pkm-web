import { Alert, Button, Card, Checkbox, Drawer, Form, Input, Popconfirm, Select, Space, Tabs, Tag, message } from "antd";
import { ResultTable } from "../components/SearchTable";
import { useEffect, useState } from "react";
import { api, apiErrorDetail, asList, UserInfo } from "../api";
import { ACCOUNT_CAPS, DEFAULT_MEMBER_CAPS, useAuth } from "../auth";
import AuditLogsPanel from "./AuditLogsPanel";

/**
 * 产品信息已迁至产品管理；此处维护大模型、飞书与访问账号。JoySpace 使用当前登录态。
 */
export default function SettingsPage() {
  const { user } = useAuth();
  const [llmForm] = Form.useForm();
  const [userForm] = Form.useForm();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [capDraft, setCapDraft] = useState<Record<string, boolean>>({});
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmProbe, setLlmProbe] = useState<{ ok: boolean; model?: string; latency_ms?: number; reply?: string; error?: string } | null>(null);

  /**
   * 保存连接配置，并向 chat/completions 发一条短对话验证大模型是否可用。
   */
  const saveLlmSettings = async (values: Record<string, unknown>) => {
    setSavingLlm(true);
    try {
      const res = await api.put("/api/settings", {
        llm_provider: values.llm_provider,
        llm_base_url: values.llm_base_url,
        llm_model: values.llm_model,
        llm_api_key: values.llm_api_key,
        feishu_app_id: values.feishu_app_id,
        feishu_app_secret: values.feishu_app_secret,
        feishu_user_access_token: values.feishu_user_access_token,
      });
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
      llmForm.setFieldsValue({
        llm_provider: res.data.llm_provider,
        llm_base_url: res.data.llm_base_url,
        llm_model: res.data.llm_model,
        llm_api_key: res.data.llm_api_key,
        feishu_app_id: res.data.feishu_app_id,
        feishu_app_secret: res.data.feishu_app_secret,
        feishu_user_access_token: res.data.feishu_user_access_token,
      }),
    );
    if (user?.role === "admin") {
      api.get("/api/users").then((res) => setUsers(asList<UserInfo>(res.data)));
    }
  }, [user]);

  /**
   * 刷新账号列表。
   */
  const loadUsers = async () => {
    const res = await api.get("/api/users");
    setUsers(asList<UserInfo>(res.data));
  };

  /**
   * 手动添加可访问账号。
   */
  const addUser = async (values: { username: string; display_name?: string }) => {
    try {
      await api.post("/api/users", { ...values, role: "editor" });
      message.success("已开通访问");
      userForm.resetFields();
      await loadUsers();
    } catch (err: unknown) {
      message.error(apiErrorDetail(err, "添加失败"));
    }
  };

  /**
   * 打开能力编辑。
   * @param {UserInfo} row
   */
  const openCaps = (row: UserInfo) => {
    const next: Record<string, boolean> = {};
    ACCOUNT_CAPS.forEach((item) => {
      next[item.key] = row.caps?.[item.key] ?? Boolean(DEFAULT_MEMBER_CAPS[item.key]);
    });
    setCapDraft(next);
    setEditingUser(row);
  };

  /**
   * 保存能力开关。
   */
  const saveCaps = async () => {
    if (!editingUser) return;
    try {
      await api.put(`/api/users/${editingUser.id}`, { caps: capDraft });
      message.success("权限已更新");
      setEditingUser(null);
      await loadUsers();
    } catch (err: unknown) {
      message.error(apiErrorDetail(err, "更新失败"));
    }
  };

  /**
   * 删除其他账号，知识内容保留。
   * @param {UserInfo} row
   */
  const removeUser = async (row: UserInfo) => {
    try {
      await api.delete(`/api/users/${row.id}`);
      message.success("账号已删除，知识内容保留");
      await loadUsers();
    } catch (err: unknown) {
      message.error(apiErrorDetail(err, "删除失败"));
    }
  };

  /**
   * 开通或取消访问。
   * @param {UserInfo} row
   * @param {boolean} allowed
   */
  const setAllowed = async (row: UserInfo, allowed: boolean) => {
    try {
      await api.put(`/api/users/${row.id}`, { allowed });
      await loadUsers();
    } catch (err: unknown) {
      message.error(apiErrorDetail(err, "更新失败"));
    }
  };

  return (
    <div>
      <div className="pkm-page-kicker">Settings</div>
      <h1 className="pkm-page-title">系统设置</h1>
      <p className="pkm-page-desc">
        大模型是全平台统一配置，所有用户的抽取和问答都走这里，个人不能覆盖。解析风格请各人到「技能配置」调整。JoySpace 使用当前登录身份读取。
      </p>
      <Tabs
        style={{ marginTop: 20 }}
        items={[
        {
          key: "llm",
          label: "大模型与飞书",
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
                        : `${llmProbe.error}。配置不正确时仍可上传文档，但不会自动填字段，请到知识治理中手工添加并编辑。`
                    }
                  />
                ) : (
                  <Alert
                    style={{ marginBottom: 16 }}
                    type="info"
                    showIcon
                    message="全平台共用。保存时会发一条短对话做验证；探测成功只说明短对话通了，抽取是另一次更长的请求。"
                  />
                )}
                <Form.Item name="llm_provider" label="提供方">
                  <Select
                    options={[
                      { value: "joybuilder", label: "京东 JoyBuilder" },
                      { value: "openai_compat", label: "OpenAI 兼容（含本地 Ollama / vLLM）" },
                    ]}
                    onChange={(value) => {
                      if (value === "joybuilder") {
                        const cur = llmForm.getFieldsValue();
                        llmForm.setFieldsValue({
                          llm_base_url: cur.llm_base_url || "http://llm-gw.jd.local/v1",
                          llm_model: cur.llm_model || "GLM-5.3-joybuilder",
                        });
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="llm_base_url"
                  label="调用地址"
                  extra="JoyBuilder 填 http://llm-gw.jd.local/v1，也可填完整到 /v1/chat/completions"
                >
                  <Input placeholder="http://llm-gw.jd.local/v1" />
                </Form.Item>
                <Form.Item
                  name="llm_model"
                  label="模型标识"
                  extra="须与 JoyBuilder 控制台完全一致，例如 GLM-5.3-joybuilder"
                >
                  <Input placeholder="GLM-5.3-joybuilder" />
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
                <p className="pkm-muted">JoySpace 在线文档使用当前登录身份读取。</p>
                <Button type="primary" htmlType="submit" loading={savingLlm}>
                  保存并验证大模型
                </Button>
              </Form>
            </Card>
          ),
        },
        {
          key: "users",
          label: "访问账号",
          children:
            user?.role === "admin" ? (
              <Card>
                <p className="pkm-muted" style={{ marginTop: 0 }}>
                  手动添加成员账号后即可访问。已开通账号默认能看到全部在线产品；下架产品只留给能维护该产品的人。删除账号只去掉登录，已经编写的产品和知识都会保留。
                </p>
                <Form form={userForm} layout="inline" onFinish={addUser} style={{ marginBottom: 16, rowGap: 12 }}>
                  <Form.Item name="username" rules={[{ required: true, message: "请填写账号" }]}>
                    <Input placeholder="账号 / SSO 用户名" style={{ width: 180 }} />
                  </Form.Item>
                  <Form.Item name="display_name">
                    <Input placeholder="姓名（可选）" style={{ width: 140 }} />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit">
                      添加并开通
                    </Button>
                  </Form.Item>
                </Form>
                <ResultTable
                  rowKey="id"
                  dataSource={users}
                  pagination={users.length > 20 ? undefined : false}
                  columns={[
                    { title: "账号", dataIndex: "username", width: 160 },
                    { title: "姓名", dataIndex: "display_name", width: 140 },
                    {
                      title: "角色",
                      dataIndex: "role",
                      width: 100,
                      render: (role: string) => (role === "admin" ? "管理员" : "成员"),
                    },
                    {
                      title: "状态",
                      width: 120,
                      render: (_, row) =>
                        row.role === "admin" || row.allowed !== false ? <Tag color="success">可访问</Tag> : <Tag>未开通</Tag>,
                    },
                    {
                      title: "操作",
                      key: "operations",
                      width: 220,
                      hideable: false,
                      render: (_, row) => {
                        const self = row.id === user?.id;
                        return (
                          <Space size={0} wrap>
                            {self ? (
                              <span className="pkm-muted">当前账号</span>
                            ) : (
                              <>
                                {row.role !== "admin" ? (
                                  <Button type="link" onClick={() => openCaps(row)}>
                                    权限
                                  </Button>
                                ) : null}
                                {row.allowed !== false ? (
                                  <Popconfirm title="取消后对方只能看到无权限页" onConfirm={() => void setAllowed(row, false)}>
                                    <Button type="link">取消访问</Button>
                                  </Popconfirm>
                                ) : (
                                  <Button type="link" onClick={() => void setAllowed(row, true)}>
                                    开通
                                  </Button>
                                )}
                                <Popconfirm
                                  title="删除该账号？产品和知识内容会保留。"
                                  onConfirm={() => void removeUser(row)}
                                >
                                  <Button type="link" danger>
                                    删除
                                  </Button>
                                </Popconfirm>
                              </>
                            )}
                          </Space>
                        );
                      },
                    },
                  ]}
                />
              </Card>
            ) : (
              <Card>仅管理员可维护访问账号。</Card>
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
      <Drawer
        title={editingUser ? `权限 · ${editingUser.display_name || editingUser.username}` : "权限"}
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        width={420}
        extra={
          <Button type="primary" onClick={() => void saveCaps()}>
            保存
          </Button>
        }
      >
        {["产品", "对象与实例", "收集", "知识包与应用"].map((group) => (
          <div key={group} style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 8 }}>{group}</h4>
            <Space direction="vertical">
              {ACCOUNT_CAPS.filter((item) => item.group === group).map((item) => (
                <Checkbox
                  key={item.key}
                  checked={Boolean(capDraft[item.key])}
                  onChange={(event) => setCapDraft((prev) => ({ ...prev, [item.key]: event.target.checked }))}
                >
                  {item.label}
                </Checkbox>
              ))}
            </Space>
          </div>
        ))}
      </Drawer>
    </div>
  );
}
