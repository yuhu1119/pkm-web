import { Alert, Button, Checkbox, Drawer, Empty, Input, Radio, Select, Space, Steps, Table, Tag, Upload, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, readPlainFile } from "../api";
import { KNOWLEDGE_MODELS, workspacePath } from "../paths";
import { useProduct } from "../product";
import ExtractCompareModal from "./ExtractCompareModal";

interface Props {
  open: boolean;
  typeId: string;
  entityId?: number;
  onClose: () => void;
  onOpenDraft?: (id: number, typeId: string) => void;
}

interface ExtractedInstance {
  _uid?: string;
  type_id: string;
  type_name?: string;
  model_code?: number;
  model_name?: string;
  name: string;
  summary?: string;
  evidence?: string;
  write_action?: string;
  write_reason?: string;
  protected?: boolean;
  needs_compare?: boolean;
  similar?: any[];
  matched_id?: number;
  payload?: Record<string, string>;
  tags?: string[];
}

const WRITE_ACTION: Record<string, { label: string; color: string }> = {
  create: { label: "将新建草稿", color: "green" },
  compare_update: { label: "需比较后更新", color: "orange" },
  skip_locked_type: { label: "类型已锁定", color: "purple" },
  skip_locked: { label: "实例已锁定", color: "purple" },
  skip_published: { label: "已发布，跳过", color: "blue" },
  skip_existing: { label: "同名已有，跳过", color: "gold" },
};

/**
 * 给抽取结果补上勾选键。
 * @param {ExtractedInstance[]} rows
 * @param {string} prefix
 */
function withUid(rows: ExtractedInstance[], prefix: string): ExtractedInstance[] {
  return (rows || []).map((item, index) => ({
    ...item,
    _uid: `${prefix}-${item.type_id}-${index}-${item.name}`,
  }));
}

/**
 * 当前对象类型或实例的文档写入：可单独上传，若涉及其他知识则提示选择。
 */
export default function SourcePipelineDrawer({ open, typeId, entityId, onClose, onOpenDraft }: Props) {
  const [sources, setSources] = useState<any[]>([]);
  const [url, setUrl] = useState("");
  const [entityName, setEntityName] = useState("");
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<any>(null);
  const [scope, setScope] = useState<"current" | "plus" | "all">("current");
  const [extraModels, setExtraModels] = useState<number[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [focusRows, setFocusRows] = useState<ExtractedInstance[]>([]);
  const [otherRows, setOtherRows] = useState<ExtractedInstance[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bindCurrent, setBindCurrent] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [compareRow, setCompareRow] = useState<ExtractedInstance | null>(null);
  const [docKind, setDocKind] = useState("");
  const [documentKinds, setDocumentKinds] = useState<any[]>([]);
  const [usedSkills, setUsedSkills] = useState<any[]>([]);
  const navigate = useNavigate();
  const { current } = useProduct();
  const focusModel = Number(String(typeId).replace(/^E/, "").slice(0, 2)) || 1;

  /**
   * 加载挂到当前类型的文档。
   */
  const load = () => {
    if (!typeId) return;
    api.get("/api/sources", { params: { type_id: typeId } }).then((res) => setSources(res.data || []));
  };

  useEffect(() => {
    if (!open) return;
    load();
    setStep(0);
    setWorking(null);
    setScan(null);
    setFocusRows([]);
    setOtherRows([]);
    setSelectedKeys([]);
    setScope("current");
    api.get("/api/extract-skills").then((res) => {
      setDocumentKinds(res.data.document_kinds || []);
    });
    setDocKind("");
    setUsedSkills([]);
    if (entityId) {
      api.get(`/api/entities/${entityId}`).then((res) => setEntityName(res.data?.entity?.name || ""));
    } else {
      setEntityName("");
    }
  }, [open, typeId, entityId]);

  const detectedModels: number[] = scan?.detected_model_codes || scan?.model_codes || [];
  const otherDetected = detectedModels.filter((code: number) => code !== focusModel);
  const allRows = useMemo(() => [...focusRows, ...otherRows], [focusRows, otherRows]);
  const selectedRows = allRows.filter((item) => selectedKeys.includes(item._uid || ""));
  const conflictRows = allRows.filter(
    (item) => item.protected || item.write_action === "compare_update" || (item.similar || []).length,
  );
  const currentKindSkill = useMemo(
    () =>
      documentKinds.find((item) => item.title === docKind || item.key === docKind) ||
      scan?.document_kind_skill ||
      null,
    [documentKinds, docKind, scan],
  );
  const kindOptions = useMemo(
    () => documentKinds.map((item: any) => ({ value: item.title, label: item.title })),
    [documentKinds],
  );

  /**
   * 识别文档覆盖范围。
   * @param {any} source
   */
  const startScan = async (source: any) => {
    setWorking(source);
    setStep(1);
    setScanning(true);
    setScan(null);
    try {
      const res = await api.post("/api/extract/scan", { source_id: source.id });
      setScan(res.data);
      setDocKind(res.data.document_kind || "");
      setUsedSkills(res.data.used_skills || []);
      const extra = (res.data.detected_model_codes || res.data.model_codes || []).filter((code: number) => code !== focusModel);
      setExtraModels(extra);
      setScope(extra.length ? "plus" : "current");
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "文档识别失败");
      setWorking(null);
      setStep(0);
    } finally {
      setScanning(false);
    }
  };

  /**
   * 按所选范围抽取，并标出冲突 / 相似知识。
   */
  const runPreview = async () => {
    if (!working) return;
    setPreviewing(true);
    try {
      const modelCodes = scope === "current" ? [] : scope === "all" ? otherDetected : extraModels;
      const res = await api.post("/api/extract/preview", {
        source_id: working.id,
        focus_type_id: typeId,
        focus_entity_id: entityId || null,
        model_codes: modelCodes,
        document_kind: docKind,
      });
      const focus = withUid(res.data.focus_instances || [], "focus");
      const others = withUid(res.data.other_instances || [], "other");
      setFocusRows(focus);
      setOtherRows(others);
      setUsedSkills(res.data.used_skills || []);
      setSelectedKeys(focus.filter((item) => item.write_action === "create").map((item) => item._uid || ""));
      setStep(2);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "抽取失败");
    } finally {
      setPreviewing(false);
    }
  };

  /**
   * 按勾选结果写入，并可把文档挂到当前实例。
   */
  const commit = async () => {
    if (!working) return;
    if (!selectedRows.length && !(bindCurrent && entityId)) {
      message.warning("请勾选要写入的实例，或选择把文档挂到当前实例");
      return;
    }
    setCommitting(true);
    try {
      const instances = selectedRows
        .filter((item) => item.write_action === "create")
        .map((item) => ({
          type_id: item.type_id,
          name: item.name,
          summary: item.summary,
          payload: item.payload,
          tags: item.tags,
          evidence: item.evidence,
          model_code: item.model_code,
          write_action: item.write_action,
          matched_id: item.matched_id,
        }));
      const res = await api.post("/api/extract/commit", {
        source_id: working.id,
        instances,
        bind_entity_id: bindCurrent && entityId ? entityId : null,
      });
      const created = res.data.created || 0;
      message.success(
        created
          ? `已新建 ${created} 条草稿${res.data.bound ? "，并挂到当前实例" : ""}。已有知识请逐条比较更新。`
          : res.data.bound
            ? "文档已挂到当前实例，未新建知识"
            : "没有新增草稿。已有知识请点「比较更新」。",
      );
      window.dispatchEvent(new Event("pkm-refresh"));
      const first = (res.data.drafts || [])[0];
      if (first?.id) {
        onOpenDraft?.(first.id, first.type_id);
      }
      onClose();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "写入失败");
    } finally {
      setCommitting(false);
    }
  };

  /**
   * 实例表格列。
   */
  const instanceColumns = [
    {
      title: "对象类型",
      width: 150,
      render: (_: unknown, row: ExtractedInstance) => `${row.type_id} ${row.type_name || ""}`,
    },
    { title: "实例", dataIndex: "name", width: 140 },
    {
      title: "处置",
      width: 140,
      render: (_: unknown, row: ExtractedInstance) => {
        const meta = WRITE_ACTION[row.write_action || "create"] || WRITE_ACTION.create;
        return (
          <Tag color={meta.color} title={row.write_reason}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: "冲突 / 相似",
      render: (_: unknown, row: ExtractedInstance) =>
        (row.similar || []).length
          ? (row.similar || []).map((item: any) => `${item.model_name}/${item.type_name}「${item.name}」`).join("；")
          : "—",
    },
    {
      title: "操作",
      width: 100,
      render: (_: unknown, row: ExtractedInstance) =>
        row.write_action === "compare_update" || (row.similar || []).length ? (
          <Button type="link" style={{ padding: 0 }} onClick={() => setCompareRow(row)}>
            比较更新
          </Button>
        ) : null,
    },
  ];

  return (
    <Drawer
      title={entityName ? `文档写入 · ${typeId} / ${entityName}` : `文档写入 · ${typeId}`}
      open={open}
      onClose={onClose}
      width={840}
      destroyOnClose
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Alert
          type="info"
          showIcon
          message={entityId ? "这份文档优先填写当前实例" : "这份文档优先填写当前对象类型"}
          description="可以只为当前路径上传独立材料。若 AI 发现还涉及其他模型或已有相似知识，会停下来让你选择：只写当前、同时写入其他类型，或跳过冲突项。整份 PRD / 手册仍建议到「知识收集」做全局分析。"
        />
        <Steps
          size="small"
          current={step}
          items={[{ title: "接入文档" }, { title: "选择范围" }, { title: "确认冲突" }]}
        />

        {step === 0 ? (
          <>
            <Space wrap>
              <Upload
                showUploadList={false}
                accept=".md,.txt,.html,.htm"
                customRequest={async ({ file, onSuccess, onError }) => {
                  try {
                    const payload = await readPlainFile(file as File);
                    const res = await api.post("/api/sources/upload", { ...payload, target_type_id: typeId });
                    load();
                    onSuccess && onSuccess({}, new XMLHttpRequest());
                    if (res.data.status === "ready") {
                      message.success("已解析，开始识别覆盖范围");
                      startScan(res.data);
                    } else {
                      message.warning("已上传，请先确认正文");
                    }
                  } catch (e) {
                    message.error((e as Error).message || "上传失败");
                    onError && onError(e as Error);
                  }
                }}
              >
                <Button type="primary">上传文档</Button>
              </Upload>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="粘贴飞书、JoySpace 或网页链接" style={{ width: 320 }} />
              <Button
                onClick={async () => {
                  if (!url) return;
                  try {
                    const res = await api.post("/api/sources/fetch", { url, connector: "auto", target_type_id: typeId });
                    setUrl("");
                    load();
                    if (res.data.status === "ready") startScan(res.data);
                    else message.warning(res.data.error_message || "抓取未完成");
                  } catch (err: any) {
                    message.error(err?.response?.data?.detail || "抓取失败");
                  }
                }}
              >
                抓取链接
              </Button>
              <Button
                type="link"
                onClick={() => {
                  onClose();
                  if (current?.id) navigate(workspacePath(current.id, "/sources"));
                }}
              >
                改为整份全局分析
              </Button>
            </Space>
            {sources.length ? (
              sources.map((item) => (
                <div key={item.id} className="pkm-source-card">
                  <div className="pkm-source-card-title">{item.title}</div>
                  <Space size={6} wrap>
                    {item.document_kind ? <Tag>{item.document_kind}</Tag> : null}
                    <Tag>{item.status === "ready" ? "可分析" : item.error_message || item.status}</Tag>
                    {(item.coverage?.instance_count || 0) > 0 ? <Tag>{item.coverage.instance_count} 条已写入</Tag> : null}
                  </Space>
                  <Button type="link" style={{ paddingLeft: 0, marginTop: 8 }} disabled={item.status !== "ready"} onClick={() => startScan(item)}>
                    分析这份文档
                  </Button>
                </div>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有文档。可为当前类型或实例单独上传一份材料。" />
            )}
          </>
        ) : null}

        {step === 1 ? (
          scanning ? (
            <div className="pkm-muted">正在阅读文档，判断它主要写什么、还涉及哪些模型…</div>
          ) : (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Alert
                type={otherDetected.length ? "warning" : "success"}
                showIcon
                message={`${scan?.document_kind || "产品资料"} · ${scan?.summary || "已完成识别"}`}
                description={
                  otherDetected.length
                    ? `当前路径是「${typeId}${entityName ? ` / ${entityName}` : ""}」。文档还涉及：${otherDetected
                        .map((code: number) => KNOWLEDGE_MODELS.find((item) => item.code === code)?.name || code)
                        .join("、")}。请选择下一步。`
                    : `文档看起来主要覆盖当前路径所属的「${KNOWLEDGE_MODELS.find((item) => item.code === focusModel)?.name || "本模型"}」，可以直接只写入当前对象类型。`
                }
              />
              <div>
                <div className="pkm-muted" style={{ marginBottom: 6 }}>
                  文档种类技能（可改）
                </div>
                <Select
                  style={{ width: 280 }}
                  value={docKind || undefined}
                  placeholder="按扫描结果，也可改选"
                  onChange={setDocKind}
                  options={[
                    ...kindOptions,
                    ...(docKind && !kindOptions.some((item) => item.value === docKind)
                      ? [{ value: docKind, label: docKind }]
                      : []),
                  ]}
                />
                {currentKindSkill ? (
                  <div className="pkm-muted" style={{ marginTop: 8 }}>
                    本类优先模型：{(currentKindSkill.focus_model_names || []).join("、") || "按文档实际"}
                    {currentKindSkill.related_type_count
                      ? ` · 关联 ${currentKindSkill.related_type_count} 个对象类型`
                      : ""}
                    <Button type="link" size="small" onClick={() => navigate(`/skills?kind=${currentKindSkill.key || ""}`)}>
                      去配置
                    </Button>
                  </div>
                ) : null}
                {(currentKindSkill?.related_types || []).length ? (
                  <div style={{ marginTop: 8 }}>
                    {(currentKindSkill.related_types || []).slice(0, 12).map((item: any) => (
                      <Tag key={item.type_id} color={item.type_id === typeId ? "blue" : undefined}>
                        {item.type_id} {item.name}
                      </Tag>
                    ))}
                    {(currentKindSkill.related_types || []).length > 12 ? (
                      <Tag>等 {currentKindSkill.related_types.length} 类</Tag>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {usedSkills.length ? (
                <div className="pkm-muted">
                  将使用技能：
                  {usedSkills
                    .map((item) =>
                      item.layer === "type" && item.field_count
                        ? `${item.title}（${item.field_count} 字段）`
                        : item.title,
                    )
                    .join(" · ")}
                </div>
              ) : null}
              {(scan?.type_hits || []).length ? (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="type_id"
                  dataSource={scan.type_hits}
                  columns={[
                    { title: "知识模型", dataIndex: "model_name", width: 120 },
                    {
                      title: "对象类型",
                      render: (_: unknown, row: any) => (
                        <span>
                          {row.type_id} {row.type_name || ""}
                          {row.kind_priority ? <Tag color="blue" style={{ marginLeft: 6 }}>本类优先</Tag> : null}
                        </span>
                      ),
                    },
                    {
                      title: "实例",
                      render: (_: unknown, row: any) =>
                        (row.instances || [])
                          .map((item: any) => `${item.name}${item.existing_id ? "（已有）" : (item.similar || []).length ? "（相似）" : ""}`)
                          .join("、") || "—",
                    },
                  ]}
                />
              ) : null}
              <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Radio value="current">只抽取并写入当前{entityId ? "实例所在" : ""}对象类型</Radio>
                <Radio value="plus" disabled={!otherDetected.length}>
                  当前类型 + 我勾选的其他模型
                </Radio>
                <Radio value="all" disabled={!otherDetected.length}>
                  按整份文档，分发到所有识别到的模型
                </Radio>
              </Radio.Group>
              {scope === "plus" ? (
                <Checkbox.Group
                  value={extraModels}
                  onChange={(values) => setExtraModels(values.map((item) => Number(item)))}
                  options={otherDetected.map((code: number) => ({
                    value: code,
                    label: KNOWLEDGE_MODELS.find((item) => item.code === code)?.name || String(code),
                  }))}
                />
              ) : null}
              {entityId ? (
                <Checkbox checked={bindCurrent} onChange={(e) => setBindCurrent(e.target.checked)}>
                  无论是否新建，都把这份文档挂到当前实例「{entityName || entityId}」
                </Checkbox>
              ) : null}
              <Space>
                <Button onClick={() => setStep(0)}>返回</Button>
                <Button type="primary" loading={previewing} onClick={runPreview}>
                  按此范围抽取
                </Button>
              </Space>
            </Space>
          )
        ) : null}

        {step === 2 ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {conflictRows.length ? (
              <Alert
                type="warning"
                showIcon
                message={`发现 ${conflictRows.length} 条已有或相似知识`}
                description="已保存的知识不会直接覆盖。请点「比较更新」，左边看现有、右边看 AI 结果，再确认变更或全部覆盖。"
              />
            ) : (
              <Alert type="success" showIcon message="未发现与已有知识的直接冲突，可新建草稿。" />
            )}
            <Space wrap>
              <Button
                onClick={() =>
                  setSelectedKeys(focusRows.filter((item) => item.write_action === "create").map((item) => item._uid || ""))
                }
              >
                只新建当前类型
              </Button>
              <Button
                disabled={!otherRows.some((item) => item.write_action === "create")}
                onClick={() =>
                  setSelectedKeys(allRows.filter((item) => item.write_action === "create").map((item) => item._uid || ""))
                }
              >
                新建全部新实例
              </Button>
              <Button
                onClick={() =>
                  setSelectedKeys(
                    allRows
                      .filter((item) => item.write_action === "create" && !(item.similar || []).length)
                      .map((item) => item._uid || ""),
                  )
                }
              >
                跳过冲突 / 相似项
              </Button>
            </Space>
            <div>
              <div style={{ marginBottom: 8 }}>当前对象类型</div>
              <Table
                rowKey="_uid"
                size="small"
                pagination={false}
                dataSource={focusRows}
                rowSelection={{
                  selectedRowKeys: selectedKeys,
                  onChange: (keys) => setSelectedKeys(keys as string[]),
                  getCheckboxProps: (row: ExtractedInstance) => ({ disabled: row.write_action !== "create" }),
                }}
                columns={instanceColumns}
                locale={{ emptyText: "当前类型没有抽出实例" }}
              />
            </div>
            {otherRows.length ? (
              <div>
                <div style={{ marginBottom: 8 }}>文档还涉及的其他对象类型</div>
                <Table
                  rowKey="_uid"
                  size="small"
                  pagination={false}
                  dataSource={otherRows}
                  rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: (keys) => setSelectedKeys(keys as string[]),
                    getCheckboxProps: (row: ExtractedInstance) => ({ disabled: row.write_action !== "create" }),
                  }}
                  columns={instanceColumns}
                  locale={{ emptyText: "没有其他类型" }}
                />
              </div>
            ) : null}
            {entityId ? (
              <Checkbox checked={bindCurrent} onChange={(e) => setBindCurrent(e.target.checked)}>
                把文档挂到当前实例「{entityName || entityId}」
              </Checkbox>
            ) : null}
            <Space>
              <Button onClick={() => setStep(1)}>返回调整范围</Button>
              <Button type="primary" loading={committing} onClick={commit}>
                确认写入{selectedRows.filter((item) => !item.protected).length ? ` ${selectedRows.filter((item) => !item.protected).length} 条` : ""}
              </Button>
            </Space>
          </Space>
        ) : null}
      </Space>
      <ExtractCompareModal
        open={!!compareRow}
        row={compareRow}
        sourceId={working?.id}
        onClose={() => setCompareRow(null)}
      />
    </Drawer>
  );
}
