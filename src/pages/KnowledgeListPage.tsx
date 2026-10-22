import { Button, Empty, Form, Input, Popconfirm, Select, Space, Tag, Upload, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, Entity, KnowledgeType } from "../api";
import GovernanceTag from "../components/GovernanceTag";
import ImportReviewDrawer from "../components/ImportReviewDrawer";
import { QueryForm, ResultTable } from "../components/SearchTable";
import { CAP_HINTS, canMutate, canWriteProduct, hasCap, useAuth } from "../auth";
import CapAction from "../components/CapAction";
import { useProduct } from "../product";
import { useWorkspace } from "../workspace";

/**
 * 知识治理：某个一级模型下，左侧对象类型、右侧实例列表。详情走抽屉维护。
 */
export default function KnowledgeListPage() {
  const { modelCode = "1" } = useParams();
  const [searchParams] = useSearchParams();
  const { openEntity, openSource } = useWorkspace();
  const { user } = useAuth();
  const { current: currentProduct } = useProduct();
  const writable = canWriteProduct(user, currentProduct);
  const [types, setTypes] = useState<KnowledgeType[]>([]);
  const [gov, setGov] = useState<Record<string, any>>({});
  const [active, setActive] = useState<string>("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryForm] = Form.useForm();
  const [filters, setFilters] = useState({ q: "", stage: "", steward: "" });
  const [importPreview, setImportPreview] = useState<any>(null);
  const [boundSources, setBoundSources] = useState<any[]>([]);

  const loadGov = () => {
    api.get("/api/governance", { params: { model_code: Number(modelCode) } }).then((res) => {
      const map: Record<string, any> = {};
      (res.data || []).forEach((item: any) => {
        map[item.type_id] = item;
      });
      setGov(map);
    }).catch(() => setGov({}));
  };

  useEffect(() => {
    api.get("/api/meta/types", { params: { model_code: Number(modelCode) } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : [];
      setTypes(list);
      const fromQuery = searchParams.get("type");
      setActive(fromQuery || list[0]?.entity_id || "");
    }).catch(() => {
      setTypes([]);
      setActive("");
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
      setLoading(true);
      api
        .get("/api/entities", { params: { type_id: active, q: filters.q || undefined } })
        .then((res) => setEntities(res.data || []))
        .catch(() => {
          setEntities([]);
          message.error("实例列表加载失败，请刷新后重试");
        })
        .finally(() => setLoading(false));
      api.get("/api/sources", { params: { type_id: active } }).then((res) => setBoundSources(res.data || [])).catch(() => setBoundSources([]));
      loadGov();
    };
    load();
    window.addEventListener("pkm-refresh", load);
    return () => window.removeEventListener("pkm-refresh", load);
  }, [active, filters.q, modelCode]);

  const current = useMemo(() => types.find((t) => t.entity_id === active), [types, active]);
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

  const rows = useMemo(() => {
    return entities.filter((item) => {
      if (filters.stage && item.stage !== filters.stage) return false;
      if (filters.steward && !(item.steward_name || "").includes(filters.steward)) return false;
      return true;
    });
  }, [entities, filters.stage, filters.steward]);

  /**
   * 应用筛选并回到第一页。
   */
  const search = () => {
    setFilters({
      q: String(queryForm.getFieldValue("q") || "").trim(),
      stage: queryForm.getFieldValue("stage") || "",
      steward: String(queryForm.getFieldValue("steward") || "").trim(),
    });
  };

  /**
   * 清空条件后立刻重查。
   */
  const reset = () => {
    queryForm.resetFields();
    setFilters({ q: "", stage: "", steward: "" });
  };

  /**
   * 刷新当前对象类型下的实例。
   */
  const reload = () => {
    if (!active) return;
    setLoading(true);
    api
      .get("/api/entities", { params: { type_id: active, q: filters.q || undefined } })
      .then((res) => setEntities(res.data || []))
      .catch(() => message.error("实例列表加载失败，请刷新后重试"))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div className="pkm-split">
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
      <main className="pkm-type-main pkm-search-stack">
        <QueryForm form={queryForm} loading={loading} onSearch={search} onReset={reset}>
          <Form.Item name="q" label="名称">
            <Input allowClear placeholder="请输入名称" />
          </Form.Item>
          <Form.Item name="steward" label="维护人">
            <Input allowClear placeholder="请输入维护人" />
          </Form.Item>
          <Form.Item name="stage" label="状态">
            <Select
              allowClear
              placeholder="全部"
              options={[
                { value: "governed", label: "已治理" },
                { value: "incomplete", label: "结构不完整" },
                { value: "extracted", label: "已抽取待治理" },
                { value: "sourced", label: "已挂来源" },
                { value: "ungoverned", label: "未治理" },
              ]}
            />
          </Form.Item>
        </QueryForm>
        {current ? (
          <div className="pkm-muted" style={{ marginBottom: 12 }}>
            {current.entity_id} {current.name} · {current.core_question}
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
            {typeLocked ? <Tag color="purple" style={{ marginLeft: 6 }}>本对象类型已锁定</Tag> : null}
            {boundSources.length ? <span> · 已有 {boundSources.length} 份文档写到本类型</span> : null}
          </div>
        ) : (
          <Empty description="请选择对象类型" />
        )}
        <ResultTable<Entity>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          onRefresh={reload}
          locale={{ emptyText: "还没有实例。可新建，或从文档写入当前类型。" }}
          operations={
            <>
              <CapAction allowed={writable && hasCap(user, "entity_create")} hint={writable ? CAP_HINTS.entity_create : CAP_HINTS.product_write}>
                <Button type="primary" disabled={!active || typeLocked} onClick={() => openEntity({ mode: "create", typeId: active })}>
                  新建
                </Button>
              </CapAction>
              <CapAction allowed={writable && hasCap(user, "source_write")} hint={writable ? CAP_HINTS.source_write : CAP_HINTS.product_write}>
                <Button disabled={!active || typeLocked} onClick={() => active && openSource(active)}>
                  从文档写入
                </Button>
              </CapAction>
              {isSheet ? (
                <CapAction allowed={writable && hasCap(user, "entity_create")} hint={writable ? CAP_HINTS.entity_create : CAP_HINTS.product_write}>
                  <Upload
                    showUploadList={false}
                    accept=".xlsx"
                    disabled={!active || typeLocked}
                    customRequest={async ({ file, onSuccess, onError }) => {
                      const data = new FormData();
                      data.append("file", file as File);
                      try {
                        const res = await api.post(`/api/templates/${active}/import/preview`, data);
                        setImportPreview(res.data);
                        onSuccess && onSuccess({}, new XMLHttpRequest());
                      } catch (e) {
                        message.error("导入失败，请使用本对象 Excel 模版的「明细」表");
                        onError && onError(e as Error);
                      }
                    }}
                  >
                    <Button disabled={!active || typeLocked || !writable || !hasCap(user, "entity_create")}>批量导入</Button>
                  </Upload>
                </CapAction>
              ) : null}
              {writable && hasCap(user, "entity_edit_others") ? (
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
              ) : null}
            </>
          }
          columns={[
            { title: "名称", dataIndex: "name", width: 168 },
            ...(groupKey
              ? [{ title: current?.fields.find((f) => f.key === groupKey)?.label || "分组", dataIndex: groupKey, width: 128, render: (_: any, row: Entity) => row.payload?.[groupKey] || "-" }]
              : []),
            ...(current?.entity_id === "E02-003"
              ? [
                  { title: "页面类型", dataIndex: "page_type", width: 108, render: (_: any, row: Entity) => row.payload?.page_type || "-" },
                  { title: "使用角色", dataIndex: "used_by_roles", width: 140, render: (_: any, row: Entity) => row.payload?.used_by_roles || "-" },
                ]
              : []),
            {
              title: "维护人",
              dataIndex: "steward_name",
              width: 140,
              render: (_: any, row: Entity) =>
                row.steward_name ? `${row.steward_name}${row.steward_role ? ` · ${row.steward_role}` : ""}` : "-",
            },
            { title: "摘要", dataIndex: "summary", width: 280 },
            {
              title: "状态",
              dataIndex: "stage",
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
              key: "operations",
              width: 176,
              hideable: false,
              render: (_: any, row: Entity) => (
                <Space>
                  <Button type="link" onClick={() => openEntity({ mode: "view", id: row.id, typeId: row.type_id })}>
                    查看
                  </Button>
                  {row.locked || typeLocked || !writable || !canMutate(user, row.created_by, "entity_edit_own", "entity_edit_others") ? null : (
                    <Button type="link" onClick={() => openEntity({ mode: "edit", id: row.id, typeId: row.type_id })}>
                      治理
                    </Button>
                  )}
                  {writable && canMutate(user, row.created_by, "entity_edit_own", "entity_edit_others") ? (
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
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      </main>
      <ImportReviewDrawer
        open={!!importPreview}
        preview={importPreview}
        onClose={() => setImportPreview(null)}
      />
    </div>
    </div>
  );
}
