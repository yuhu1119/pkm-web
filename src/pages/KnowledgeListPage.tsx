import { Button, Card, Descriptions, Divider, Dropdown, Empty, Input, Modal, Popconfirm, Space, Table, Tag, Typography, Upload, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api, downloadAuth, Entity, KnowledgeType } from "../api";
import GovernanceTag from "../components/GovernanceTag";
import ImportReviewDrawer from "../components/ImportReviewDrawer";
import { KNOWLEDGE_MODELS } from "../paths";
import { useWorkspace } from "../workspace";

/**
 * 知识治理：某个一级模型下，左侧对象类型、右侧实例列表。详情走抽屉维护。
 */
export default function KnowledgeListPage() {
  const { modelCode = "1" } = useParams();
  const [searchParams] = useSearchParams();
  const { openEntity, openSource } = useWorkspace();
  const navigate = useNavigate();
  const [types, setTypes] = useState<KnowledgeType[]>([]);
  const [gov, setGov] = useState<Record<string, any>>({});
  const [active, setActive] = useState<string>("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [keyword, setKeyword] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [boundSources, setBoundSources] = useState<any[]>([]);
  const [skill, setSkill] = useState<any>(null);

  const loadGov = () => {
    api.get("/api/governance", { params: { model_code: Number(modelCode) } }).then((res) => {
      const map: Record<string, any> = {};
      res.data.forEach((item: any) => {
        map[item.type_id] = item;
      });
      setGov(map);
    });
  };

  useEffect(() => {
    api.get("/api/meta/types", { params: { model_code: Number(modelCode) } }).then((res) => {
      setTypes(res.data);
      const fromQuery = searchParams.get("type");
      setActive(fromQuery || res.data[0]?.entity_id || "");
    });
    loadGov();
  }, [modelCode]);

  useEffect(() => {
    const fromQuery = searchParams.get("type");
    if (fromQuery) setActive(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (!active) return;
    const load = () => {
      api
        .get("/api/entities", { params: { type_id: active, q: keyword || undefined } })
        .then((res) => setEntities(res.data || []))
        .catch(() => {
          setEntities([]);
          message.error("实例列表加载失败，请刷新后重试");
        });
      api.get("/api/sources", { params: { type_id: active } }).then((res) => setBoundSources(res.data || []));
      api.get(`/api/extract-skills/types/${active}`).then((res) => setSkill(res.data)).catch(() => setSkill(null));
      loadGov();
    };
    load();
    window.addEventListener("pkm-refresh", load);
    return () => window.removeEventListener("pkm-refresh", load);
  }, [active, keyword, modelCode]);

  const current = useMemo(() => types.find((t) => t.entity_id === active), [types, active]);
  const model = KNOWLEDGE_MODELS.find((item) => item.code === Number(modelCode));
  const typeLocked = !!gov[active]?.locked;
  const isSheet = current?.template_kind === "xlsx";
  const groupKey = current?.inventory_group_field || "";
  const groupStats = useMemo(() => {
    if (!groupKey) return [];
    const map: Record<string, number> = {};
    entities.forEach((e) => {
      const key = String(e.payload?.[groupKey] || "未填写").trim() || "未填写";
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [entities, groupKey]);

  const openTemplate = async () => {
    if (!active) return;
    const res = await api.get(`/api/templates/${active}`);
    setPreview(res.data);
  };

  return (
    <div>
      <div className="pkm-page-kicker">Knowledge</div>
      <h1 className="pkm-page-title">{model?.name || "知识治理"}</h1>
      <p className="pkm-page-desc">按对象类型维护实例：核对抽取结果、补全必填字段并发布。</p>
      <div className="pkm-split" style={{ marginTop: 20 }}>
      <aside className="pkm-type-nav">
        <div className="pkm-type-nav-title">对象类型</div>
        {types.map((t) => {
          const item = gov[t.entity_id];
          return (
            <button
              key={t.entity_id}
              type="button"
              className={`pkm-type-item${t.entity_id === active ? " active" : ""}`}
              onClick={() => setActive(t.entity_id)}
            >
              <div className="pkm-type-item-head">
                <span>{t.entity_id}</span>
                <span>
                  {item?.instance_count || 0} 条 · <GovernanceTag stage={item?.stage} completeness={item?.inspections?.[0]?.completeness} />
                </span>
              </div>
              <div className="pkm-type-item-name">
                {t.name}
                {item?.locked ? <Tag color="purple" style={{ marginLeft: 6 }}>锁定</Tag> : null}
              </div>
            </button>
          );
        })}
      </aside>
      <main className="pkm-type-main">
        <Card
          title={current ? `${current.entity_id} ${current.name}` : "知识治理"}
          extra={
            <Space wrap>
              <Input.Search allowClear placeholder="搜索" onSearch={setKeyword} style={{ width: 200 }} />
              <Dropdown
                menu={{
                  items: [
                    { key: "preview", label: "预览填写模版" },
                    { key: "download", label: "下载 CSV 模版" },
                  ],
                  onClick: ({ key }) => {
                    if (key === "preview") openTemplate();
                    if (key === "download" && active) {
                      downloadAuth(`/api/templates/${active}/download`, `${active}.csv`);
                    }
                  },
                }}
              >
                <Button>模版</Button>
              </Dropdown>
              {isSheet && !typeLocked ? (
                <Upload
                  showUploadList={false}
                  accept=".json,.csv,.txt"
                  customRequest={async ({ file, onSuccess, onError }) => {
                    try {
                      const text = await (file as File).text();
                      let payload: unknown;
                      try {
                        payload = JSON.parse(text);
                      } catch {
                        throw new Error("请导入 JSON（Excel 模版导入后续提供）");
                      }
                      const res = await api.post(`/api/templates/${active}/import/preview`, payload);
                      setImportPreview(res.data);
                      onSuccess && onSuccess({}, new XMLHttpRequest());
                    } catch (e) {
                      message.error((e as Error).message || "导入失败，本期请使用 JSON");
                      onError && onError(e as Error);
                    }
                  }}
                >
                  <Button>导入 JSON</Button>
                </Upload>
              ) : null}
              <Popconfirm
                title={typeLocked ? "解锁后，后续文档解析可以再写入本类型" : "锁定后，文档解析和 Excel 导入都不会改本类型"}
                onConfirm={async () => {
                  await api.post(`/api/types/${active}/lock`, { locked: !typeLocked });
                  message.success(typeLocked ? "已解锁本对象类型" : "已锁定本对象类型");
                  window.dispatchEvent(new Event("pkm-refresh"));
                }}
              >
                <Button disabled={!active}>{typeLocked ? "解锁本类型" : "锁定本类型"}</Button>
              </Popconfirm>
              <Button disabled={!active || typeLocked} onClick={() => active && openSource(active)}>
                从文档写入
              </Button>
              <Button type="primary" disabled={!active || typeLocked} onClick={() => openEntity({ mode: "create", typeId: active })}>
                新建
              </Button>
            </Space>
          }
        >
          {current ? (
            <div className="pkm-muted" style={{ marginBottom: 12 }}>
              {current.core_question}
              {groupStats.length ? (
                <span>
                  {" "}
                  {groupStats.map((item) => (
                    <Tag key={item.name} style={{ marginLeft: 6 }}>
                      {item.name} {item.count}
                    </Tag>
                  ))}
                </span>
              ) : null}
              <div style={{ marginTop: 8 }}>
                {typeLocked ? (
                  <Tag color="purple">本对象类型已锁定</Tag>
                ) : null}
                {skill ? (
                  <div className="pkm-skill-box">
                    <div>
                      <strong>抽取技能</strong>
                      {skill.is_default ? <Tag style={{ marginLeft: 8 }}>目录默认</Tag> : <Tag color="blue" style={{ marginLeft: 8 }}>已覆盖</Tag>}
                      <Button type="link" size="small" onClick={() => navigate(`/skills?type=${encodeURIComponent(active)}`)}>
                        去配置
                      </Button>
                    </div>
                    {skill.instruction ? (
                      <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{skill.instruction}</div>
                    ) : null}
                    {(skill.related_document_kinds || []).length ? (
                      <div style={{ marginTop: 8 }}>
                        <span className="pkm-muted">关联文档种类：</span>
                        {(skill.related_document_kinds || []).map((item: any) => (
                          <Tag key={item.key}>{item.title}</Tag>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 8 }}>
                      <span className="pkm-muted">
                        治理字段{skill.fields_overridden ? "（已在技能中调整）" : "（与详情一致）"}：
                      </span>
                      {(skill.fields || []).map((field: any) => (
                        <Tag key={field.key} color={field.required ? "blue" : undefined}>
                          {field.label}
                          {field.required ? " · 必填" : ""}
                        </Tag>
                      ))}
                    </div>
                  </div>
                ) : null}
                {boundSources.length ? (
                  <>
                    已有 {boundSources.length} 份文档写到本类型
                    {boundSources.slice(0, 3).map((item) => (
                      <Tag
                        key={item.id}
                        style={{ marginLeft: 6, cursor: "pointer" }}
                        onClick={() => openSource(active)}
                      >
                        {item.title}
                      </Tag>
                    ))}
                    <Button type="link" size="small" onClick={() => openSource(active)}>
                      看来源还写到哪些类型
                    </Button>
                  </>
                ) : (
                  <>本类型可以单独上传文档来填写。若材料其实是整份 PRD，分析时会提示是否同时写入其他类型。</>
                )}
              </div>
            </div>
          ) : (
            <Empty description="请选择对象类型" />
          )}
          <Table
            rowKey="id"
            dataSource={entities}
            locale={{ emptyText: "还没有实例。可新建，或从文档写入当前类型。" }}
            columns={[
              { title: "名称", dataIndex: "name" },
              ...(groupKey
                ? [{ title: current?.fields.find((f) => f.key === groupKey)?.label || "分组", render: (_: any, row: Entity) => row.payload?.[groupKey] || "-" }]
                : []),
              ...(current?.entity_id === "E02-003"
                ? [
                    { title: "页面类型", render: (_: any, row: Entity) => row.payload?.page_type || "-" },
                    { title: "使用角色", render: (_: any, row: Entity) => row.payload?.used_by_roles || "-", ellipsis: true },
                  ]
                : []),
              {
                title: "维护人",
                width: 140,
                render: (_: any, row: Entity) =>
                  row.steward_name ? `${row.steward_name}${row.steward_role ? ` · ${row.steward_role}` : ""}` : "-",
              },
              { title: "摘要", dataIndex: "summary", ellipsis: true },
              {
                title: "状态",
                width: 180,
                render: (_: any, row: Entity) => (
                  <Space size={4} wrap>
                    <GovernanceTag stage={row.stage} completeness={row.completeness} />
                    {row.locked ? <Tag color="purple">锁定</Tag> : null}
                  </Space>
                ),
              },
              {
                title: "操作",
                width: 180,
                render: (_: any, row: Entity) => (
                  <Space>
                    <Button type="link" onClick={() => openEntity({ mode: "view", id: row.id, typeId: row.type_id })}>
                      查看
                    </Button>
                    {row.locked || typeLocked ? null : (
                      <Button type="link" onClick={() => openEntity({ mode: "edit", id: row.id, typeId: row.type_id })}>
                        治理
                      </Button>
                    )}
                    <Button
                      type="link"
                      onClick={async () => {
                        await api.post(`/api/entities/${row.id}/lock`, { locked: !row.locked });
                        message.success(row.locked ? "已解锁" : "已锁定，后续解析不会改这条");
                        window.dispatchEvent(new Event("pkm-refresh"));
                      }}
                    >
                      {row.locked ? "解锁" : "锁定"}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </main>
      <Modal
        title={preview ? preview.filename : "填写模版"}
        open={!!preview}
        onCancel={() => setPreview(null)}
        width={880}
        footer={
          preview ? (
            <Space>
              <Button onClick={() => downloadAuth(`/api/templates/${preview.type_id}/download`, `${preview.type_id}.csv`)}>
                下载 CSV
              </Button>
              <Button type="primary" onClick={() => downloadAuth(`/api/templates/${preview.type_id}/download`, `${preview.type_id}.csv`)}>
                下载填写表
              </Button>
            </Space>
          ) : null
        }
      >
        {preview?.template_kind === "xlsx" ? (
          <>
            <Typography.Paragraph>
              清单类知识请用 Excel：一行一条。系统按明细自动统计条数
              {preview.inventory_group_field ? "并按分组字段汇总（如页面按所属模块）。" : "。"}
            </Typography.Paragraph>
            <Table
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={preview.columns || []}
              columns={[
                { title: "列", dataIndex: "label", width: 140 },
                { title: "必填", width: 70, render: (_: any, r: any) => (r.required ? "是" : "") },
                { title: "填写说明", dataIndex: "instruction" },
              ]}
            />
          </>
        ) : (
        preview?.sections?.map((section: any) => (
          <div key={section.title} style={{ marginBottom: 20 }}>
            <Typography.Title level={5}>{section.title}</Typography.Title>
            {section.hint && <Typography.Paragraph type="secondary">{section.hint}</Typography.Paragraph>}
            {section.body && <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{section.body}</Typography.Paragraph>}
            {section.rows && (
              <Descriptions bordered size="small" column={1}>
                {section.rows.map((row: any) => (
                  <Descriptions.Item key={row.label} label={row.label}>
                    <div>{row.instruction}</div>
                    <div className="pkm-empty">{row.example || "（填写）"}</div>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            )}
            {section.fields?.map((field: any) => (
              <Card key={field.key} size="small" style={{ marginBottom: 8 }} title={field.label}>
                <div>{field.instruction}</div>
                {field.example && (
                  <>
                    <Divider style={{ margin: "8px 0" }} />
                    <Typography.Paragraph type="secondary" style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                      示例：{field.example}
                    </Typography.Paragraph>
                  </>
                )}
              </Card>
            ))}
          </div>
        ))
        )}
      </Modal>
      <ImportReviewDrawer
        open={!!importPreview}
        preview={importPreview}
        onClose={() => setImportPreview(null)}
      />
    </div>
    </div>
  );
}
