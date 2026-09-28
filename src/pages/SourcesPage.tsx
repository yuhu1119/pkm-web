import { Alert, Button, Card, Checkbox, Drawer, Input, Modal, Progress, Select, Space, Steps, Table, Tag, Upload, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, readPlainFile } from "../api";
import { KNOWLEDGE_MODELS, workspacePath } from "../paths";
import { useProduct } from "../product";
import ExtractCompareModal from "../components/ExtractCompareModal";

const EXTRACT_META: Record<string, { label: string; color: string }> = {
  none: { label: "未分析", color: "default" },
  success: { label: "已写入草稿", color: "success" },
  failed: { label: "分析失败", color: "error" },
};

const SOURCE_KIND: Record<string, string> = {
  local: "本地文件",
  feishu: "飞书",
  joyspace: "JoySpace",
  web: "在线链接",
};

interface ExtractedInstance {
  _uid: string;
  type_id: string;
  type_name?: string;
  model_code?: number;
  model_name?: string;
  name: string;
  summary?: string;
  payload?: Record<string, string>;
  confidence?: number;
  evidence?: string;
  tags?: string[];
  write_action?: string;
  write_reason?: string;
  matched_id?: number;
  protected?: boolean;
  similar?: { id: number; name: string; type_name?: string; model_name?: string; kind?: string }[];
  needs_compare?: boolean;
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
 * 知识收集：上传 PRD / 手册 / 在线文档，AI 按十大模型抽出对象实例草稿。
 */
export default function SourcesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [url, setUrl] = useState("");
  const [connector, setConnector] = useState("auto");
  const [preview, setPreview] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<any>(null);
  const [modelCodes, setModelCodes] = useState<number[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0, code: 0 });
  const [modelStatus, setModelStatus] = useState<Record<number, "wait" | "run" | "ok" | "fail" | "empty">>({});
  const [instances, setInstances] = useState<ExtractedInstance[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [compareRow, setCompareRow] = useState<ExtractedInstance | null>(null);
  const [fromTypeName, setFromTypeName] = useState("");
  const [docKind, setDocKind] = useState("");
  const [documentKinds, setDocumentKinds] = useState<any[]>([]);
  const [usedSkills, setUsedSkills] = useState<any[]>([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { current } = useProduct();
  const base = current?.id ? workspacePath(current.id) : "/products";
  const fromType = searchParams.get("fromType") || "";
  const analyzeId = Number(searchParams.get("analyze") || 0);

  /**
   * 刷新当前产品的来源列表。
   */
  const load = () => api.get("/api/sources").then((res) => setRows(res.data));

  useEffect(() => {
    load();
    api.get("/api/extract-skills").then((res) => setDocumentKinds(res.data.document_kinds || []));
  }, [current?.id]);

  useEffect(() => {
    if (!fromType) {
      setFromTypeName("");
      return;
    }
    api.get("/api/meta/types").then((res) => {
      const found = (res.data || []).find((item: any) => item.entity_id === fromType);
      setFromTypeName(found ? `${found.entity_id} ${found.name}` : fromType);
    });
  }, [fromType]);

  useEffect(() => {
    if (!analyzeId) return;
    api.get(`/api/sources/${analyzeId}`).then((res) => {
      if (res.data?.status === "ready") startAnalyze(res.data);
    });
  }, [analyzeId, current?.id]);

  const selectedInstances = useMemo(
    () => instances.filter((item) => selectedKeys.includes(item._uid)),
    [instances, selectedKeys],
  );

  /**
   * 关闭分析抽屉并清空中间状态。
   */
  const closeAnalyze = () => {
    setAnalyzing(null);
    setStep(0);
    setScan(null);
    setDocKind("");
    setUsedSkills([]);
    setModelCodes([]);
    setExtracting(false);
    setInstances([]);
    setSelectedKeys([]);
    setModelStatus({});
    setCommitResult(null);
  };

  /**
   * 识别文档种类及覆盖的一级模型。
   * @param {any} source
   */
  const startAnalyze = async (source: any) => {
    setAnalyzing(source);
    setStep(0);
    setScan(null);
    setInstances([]);
    setSelectedKeys([]);
    setScanning(true);
    try {
      const res = await api.post("/api/extract/scan", { source_id: source.id });
      setScan(res.data);
      setDocKind(res.data.document_kind || "");
      setUsedSkills(res.data.used_skills || []);
      setModelCodes(res.data.model_codes || [1]);
      setStep(0);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "文档识别失败，请检查大模型配置");
      setAnalyzing(null);
    } finally {
      setScanning(false);
    }
  };

  /**
   * 按勾选的一级模型逐个抽取实例，先不落库。
   */
  const runExtract = async () => {
    if (!analyzing || !modelCodes.length) return;
    setExtracting(true);
    setStep(1);
    const collected: ExtractedInstance[] = [];
    const status: Record<number, "wait" | "run" | "ok" | "fail" | "empty"> = {};
    modelCodes.forEach((code) => {
      status[code] = "wait";
    });
    setModelStatus({ ...status });
    for (let i = 0; i < modelCodes.length; i += 1) {
      const code = modelCodes[i];
      status[code] = "run";
      setExtractProgress({ current: i + 1, total: modelCodes.length, code });
      setModelStatus({ ...status });
      try {
        const res = await api.post("/api/extract/model", {
          source_id: analyzing.id,
          model_code: code,
          document_kind: docKind,
        });
        const rows = (res.data.instances || []) as Omit<ExtractedInstance, "_uid">[];
        if (res.data.used_skills) setUsedSkills(res.data.used_skills);
        rows.forEach((item, index) => {
          collected.push({
            ...item,
            _uid: `${code}-${item.type_id}-${index}-${item.name}`,
          });
        });
        status[code] = rows.length ? "ok" : "empty";
      } catch {
        status[code] = "fail";
      }
      setModelStatus({ ...status });
    }
    setInstances(collected);
    setSelectedKeys(collected.filter((item) => item.write_action === "create").map((item) => item._uid));
    setExtracting(false);
    setStep(2);
    if (!collected.length) {
      message.warning("未抽出可写入的实例。可换一份材料，或缩小勾选的模型后重试。");
    }
  };

  /**
   * 把勾选的分析结果写成待治理草稿。
   */
  const commitDrafts = async () => {
    if (!analyzing) return;
    if (!selectedInstances.length) {
      message.warning("请至少勾选一条实例");
      return;
    }
    setCommitting(true);
    try {
      const payload = selectedInstances
        .filter((item) => item.write_action === "create")
        .map((item) => ({
          type_id: item.type_id,
          name: item.name,
          summary: item.summary,
          payload: item.payload,
          tags: item.tags,
          confidence: item.confidence,
          evidence: item.evidence,
          model_code: item.model_code,
        }));
      if (!payload.length) {
        message.warning("没有可新建的草稿。已有知识请点「比较更新」。");
        setCommitting(false);
        return;
      }
      const res = await api.post("/api/extract/commit", { source_id: analyzing.id, instances: payload });
      const created = res.data.created || 0;
      const coverage = res.data.coverage || { types: [], instance_count: created };
      setCommitResult({
        created,
        coverage,
        skipped: res.data.skipped || [],
        skippedCount: (res.data.skipped || []).length,
      });
      setStep(3);
      load();
      window.dispatchEvent(new Event("pkm-refresh"));
      if (created) {
        message.success(`已按对象类型写入 ${created} 条草稿`);
      } else {
        message.info("没有新增草稿（可能与已有实例重名）");
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "写入失败");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div>
      <div className="pkm-page-kicker">Ingest</div>
      <h1 className="pkm-page-title">知识收集</h1>
      <p className="pkm-page-desc">
        上传 .txt / .md / .html 或粘贴在线文档链接。本期不解析 Word / PDF / Excel，后续再迭代原文件解析。
      </p>
      <Space direction="vertical" size={16} style={{ width: "100%", marginTop: 20 }}>
      <Alert
        type="info"
        showIcon
        message="整份文档全局分析，按十大模型拆开写入"
        description={
          fromTypeName
            ? `你从「${fromTypeName}」过来。这里按整份文档做全局分析，会列出涉及的模型、对象类型和实例。若只想填写某一个对象或实例，请回到该对象下单独上传。`
            : "适合完整 PRD / 手册：一次识别覆盖了哪些一级模型、对象类型和实例，再分发写入。某个对象或实例的专项材料，请在知识治理对应路径下单独上传；若该材料还涉及其他知识，系统会提示冲突并让你选择下一步。"
        }
      />
      <Card title="接入资料">
        <Space wrap>
          <Upload
            showUploadList={false}
            accept=".md,.txt,.html,.htm"
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                const payload = await readPlainFile(file as File);
                const res = await api.post("/api/sources/upload", payload);
                message.success(res.data.status === "ready" ? "已解析，开始按十大模型识别" : "已上传，请先确认正文");
                load();
                window.dispatchEvent(new Event("pkm-refresh"));
                onSuccess && onSuccess({}, new XMLHttpRequest());
                if (res.data.status === "ready") startAnalyze(res.data);
              } catch (e) {
                message.error((e as Error).message || "上传失败");
                onError && onError(e as Error);
              }
            }}
          >
            <Button type="primary">上传文档</Button>
          </Upload>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴飞书、JoySpace 或网页链接"
            style={{ width: 360 }}
          />
          <Select
            value={connector}
            style={{ width: 140 }}
            onChange={setConnector}
            options={[
              { value: "auto", label: "自动识别" },
              { value: "feishu", label: "飞书" },
              { value: "joyspace", label: "JoySpace" },
              { value: "web", label: "通用网页" },
            ]}
          />
          <Button
            onClick={async () => {
              if (!url) return;
              try {
                const res = await api.post("/api/sources/fetch", { url, connector, target_type_id: "" });
                message.success(res.data.status === "ready" ? "已抓取，开始按十大模型识别" : "已提交，请查看抓取结果");
                setUrl("");
                load();
                window.dispatchEvent(new Event("pkm-refresh"));
                if (res.data.status === "ready") startAnalyze(res.data);
              } catch (err: any) {
                message.error(err?.response?.data?.detail || "抓取失败");
              }
            }}
          >
            抓取链接
          </Button>
        </Space>
        <div className="pkm-muted" style={{ marginTop: 12 }}>
          支持 Markdown、Word、PDF、Excel 与在线文档。同一份材料只收集一次；重复分析只会补尚未写入的对象，同名实例会跳过。
        </div>
      </Card>
      <Card title="资料列表">
        <Table
          rowKey="id"
          dataSource={rows}
          locale={{ emptyText: "还没有资料。先上传或抓取一份产品文档。" }}
          columns={[
            { title: "标题", dataIndex: "title", ellipsis: true },
            {
              title: "来源",
              dataIndex: "source_type",
              width: 110,
              render: (v) => SOURCE_KIND[v] || v,
            },
            {
              title: "正文",
              dataIndex: "status",
              width: 140,
              render: (v, r) => <Tag color={v === "ready" ? "green" : v === "error" ? "red" : "gold"}>{r.error_message || (v === "ready" ? "可分析" : v)}</Tag>,
            },
            {
              title: "分析",
              dataIndex: "extract_status",
              width: 110,
              render: (v) => {
                const meta = EXTRACT_META[v] || EXTRACT_META.none;
                return <Tag color={meta.color}>{meta.label}</Tag>;
              },
            },
            {
              title: "已写入",
              width: 280,
              render: (_: unknown, r: any) => {
                const coverage = r.coverage || {};
                const types = coverage.types || [];
                if (!types.length) return <span className="pkm-muted">尚未分发</span>;
                return (
                  <Space size={4} wrap>
                    <span>
                      {coverage.instance_count} 条 / {coverage.type_count} 类
                    </span>
                    {types.slice(0, 3).map((item: any) => (
                      <Tag key={item.type_id}>
                        {item.type_name} {item.count}
                      </Tag>
                    ))}
                    {types.length > 3 ? <Tag>+{types.length - 3}</Tag> : null}
                  </Space>
                );
              },
            },
            { title: "创建人", dataIndex: "created_by", width: 90 },
            {
              title: "操作",
              width: 240,
              render: (_, r) => (
                <Space>
                  <Button type="link" onClick={() => setPreview(r)}>
                    预览
                  </Button>
                  <Button type="link" disabled={r.status !== "ready"} onClick={() => startAnalyze(r)}>
                    分析十大模型
                  </Button>
                  <Button
                    type="link"
                    onClick={async () => {
                      await api.post(`/api/sources/${r.id}/refresh`);
                      message.success("已刷新");
                      load();
                    }}
                  >
                    刷新
                  </Button>
                  <Button
                    type="link"
                    danger
                    onClick={async () => {
                      await api.delete(`/api/sources/${r.id}`);
                      load();
                      window.dispatchEvent(new Event("pkm-refresh"));
                    }}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal title={preview?.title} open={!!preview} onCancel={() => setPreview(null)} footer={null} width={800}>
        <pre className="pkm-pre">{preview?.content || "暂无正文"}</pre>
      </Modal>
      <Drawer
        title={analyzing ? `分析 · ${analyzing.title}` : "分析十大模型"}
        open={!!analyzing}
        onClose={closeAnalyze}
        width={880}
        destroyOnClose
        extra={
          step === 2 ? (
            <Button type="primary" loading={committing} onClick={commitDrafts}>
              写入 {selectedInstances.length} 条草稿
            </Button>
          ) : null
        }
      >
        <Steps
          size="small"
          current={step}
          style={{ marginBottom: 20 }}
          items={[{ title: "识别覆盖" }, { title: "按模型抽取" }, { title: "确认写入" }, { title: "分发结果" }]}
        />
        {scanning ? (
          <div className="pkm-muted">正在阅读文档，判断它覆盖哪些知识模型、对象类型和实例…</div>
        ) : null}
        {scan && step === 0 ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message={`${scan.document_kind || "产品资料"} · ${scan.summary || "已完成识别"}`}
              description="以下是整份文档的全局覆盖。请确认文档种类、涉及的模型、对象类型和实例后再抽取。抽取会带上该种类关联对象的治理字段。"
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
                options={documentKinds.map((item: any) => ({ value: item.title, label: item.title }))}
              />
              {(() => {
                const kind =
                  documentKinds.find((item: any) => item.title === docKind || item.key === docKind) ||
                  scan.document_kind_skill;
                if (!kind) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div className="pkm-muted">
                      本类优先模型：{(kind.focus_model_names || []).join("、") || "按文档实际"}
                      {kind.related_type_count ? ` · 关联 ${kind.related_type_count} 个对象类型` : ""}
                      <Button type="link" size="small" onClick={() => navigate(`/skills?kind=${kind.key || ""}`)}>
                        去配置
                      </Button>
                    </div>
                    {(kind.related_types || []).slice(0, 12).map((item: any) => (
                      <Tag key={item.type_id}>{item.type_id} {item.name}</Tag>
                    ))}
                    {(kind.related_types || []).length > 12 ? <Tag>等 {kind.related_types.length} 类</Tag> : null}
                  </div>
                );
              })()}
            </div>
            {usedSkills.length ? (
              <div className="pkm-muted">
                识别已用技能：{usedSkills.map((item: any) => item.title).join(" · ")}
              </div>
            ) : null}
            {(scan.skipped_locked_types || []).length ? (
              <Alert
                type="warning"
                showIcon
                message="以下对象类型已锁定，本次分析会跳过"
                description={(scan.skipped_locked_types || []).map((item: any) => `${item.model_name}/${item.type_name}`).join("、")}
              />
            ) : null}
            {(scan.type_hits || []).length ? (
              <Table
                size="small"
                pagination={false}
                rowKey="type_id"
                dataSource={scan.type_hits}
                columns={[
                  { title: "知识模型", dataIndex: "model_name", width: 140 },
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
                    title: "文档中的实例",
                    render: (_: unknown, row: any) => {
                      const names = row.instances || [];
                      if (!names.length) return <span className="pkm-muted">未点出具体实例</span>;
                      return (
                        <Space size={4} wrap>
                          {names.map((item: any) => {
                            const conflict = item.existing_id || (item.similar || []).length;
                            return (
                              <Tag key={item.name} color={item.existing_locked ? "purple" : conflict ? "gold" : "green"}>
                                {item.name}
                                {item.existing_id ? " · 已有" : (item.similar || []).length ? " · 相似" : ""}
                              </Tag>
                            );
                          })}
                        </Space>
                      );
                    },
                  },
                ]}
              />
            ) : null}
            <div>
              <div style={{ marginBottom: 8 }}>抽取范围</div>
              <Checkbox.Group
                value={modelCodes}
                onChange={(values) => setModelCodes(values.map((item) => Number(item)))}
                options={KNOWLEDGE_MODELS.map((item) => ({
                  value: item.code,
                  label: `${item.name}${scan.model_codes?.includes(item.code) ? "（文档覆盖）" : ""}${
                    scan.locks?.fully_locked_model_codes?.includes(item.code) ? "（已全部锁定）" : ""
                  }`,
                  disabled: scan.locks?.fully_locked_model_codes?.includes(item.code),
                }))}
              />
            </div>
            <Button type="primary" disabled={!modelCodes.length} onClick={runExtract}>
              按模型抽取
            </Button>
          </Space>
        ) : null}
        {step >= 1 ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {extracting ? (
              <Progress
                percent={extractProgress.total ? Math.round((extractProgress.current / extractProgress.total) * 100) : 0}
                status="active"
                format={() => {
                  const name = KNOWLEDGE_MODELS.find((item) => item.code === extractProgress.code)?.name || "";
                  return `${extractProgress.current}/${extractProgress.total} ${name}`;
                }}
              />
            ) : null}
            <Space wrap>
              {modelCodes.map((code) => {
                const state = modelStatus[code] || "wait";
                const label = KNOWLEDGE_MODELS.find((item) => item.code === code)?.name || String(code);
                const color = state === "ok" ? "green" : state === "fail" ? "red" : state === "empty" ? "gold" : state === "run" ? "blue" : "default";
                const text = state === "ok" ? "已抽出" : state === "fail" ? "失败" : state === "empty" ? "无实例" : state === "run" ? "抽取中" : "等待";
                return (
                  <Tag key={code} color={color}>
                    {label} · {text}
                  </Tag>
                );
              })}
            </Space>
            {step === 2 ? (
              <>
                <div className="pkm-muted">
                  已有知识不会直接覆盖。请点「比较更新」，左边看现有、右边看 AI 结果，再确认变更或全部覆盖。新建项可勾选后批量写入草稿。
                </div>
                <Space wrap>
                  <Button
                    onClick={() =>
                      setSelectedKeys(
                        instances.filter((item) => item.write_action === "create").map((item) => item._uid),
                      )
                    }
                  >
                    只写入新建草稿
                  </Button>
                  <Button
                    onClick={() =>
                      setSelectedKeys(
                        instances.filter((item) => item.write_action === "create" && !(item.similar || []).length).map((item) => item._uid),
                      )
                    }
                  >
                    跳过冲突 / 相似项
                  </Button>
                </Space>
                <Table
                  rowKey="_uid"
                  size="small"
                  dataSource={instances}
                  pagination={false}
                  rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: (keys) => setSelectedKeys(keys as string[]),
                    getCheckboxProps: (row: ExtractedInstance) => ({ disabled: row.write_action !== "create" }),
                  }}
                  locale={{ emptyText: "没有抽出实例" }}
                  columns={[
                    {
                      title: "模型",
                      width: 120,
                      render: (_: unknown, row: ExtractedInstance) => row.model_name || KNOWLEDGE_MODELS.find((item) => item.code === row.model_code)?.name,
                    },
                    {
                      title: "对象类型",
                      width: 160,
                      render: (_: unknown, row: ExtractedInstance) => `${row.type_id} ${row.type_name || ""}`,
                    },
                    { title: "实例", dataIndex: "name", width: 160 },
                    {
                      title: "处置",
                      width: 160,
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
                          ? (row.similar || []).map((item) => `${item.model_name || ""}/${item.type_name || ""}「${item.name}」`).join("；")
                          : "—",
                    },
                    {
                      title: "操作",
                      width: 100,
                      render: (_: unknown, row: ExtractedInstance) =>
                        row.write_action === "compare_update" || (row.similar || []).length ? (
                          <Button type="link" onClick={() => setCompareRow(row)}>
                            比较更新
                          </Button>
                        ) : null,
                    },
                  ]}
                />
                <Space>
                  <Button onClick={() => setStep(0)}>返回调整范围</Button>
                  <Button type="primary" loading={committing} disabled={!selectedInstances.length} onClick={commitDrafts}>
                    写入待治理草稿
                  </Button>
                </Space>
              </>
            ) : null}
            {step === 3 && commitResult ? (
              <>
                <Alert
                  type="success"
                  showIcon
                  message={`已分发到 ${(commitResult.coverage?.types || []).length} 个对象类型`}
                  description={
                    commitResult.skippedCount
                      ? `另有 ${commitResult.skippedCount} 条需要比较后更新或因锁定未写入。`
                      : "新实例已按类型拆开。已有知识请回到上一步点「比较更新」。"
                  }
                />
                <Table
                  rowKey="type_id"
                  size="small"
                  pagination={false}
                  dataSource={commitResult.coverage?.types || []}
                  columns={[
                    { title: "模型", dataIndex: "model_name", width: 140 },
                    {
                      title: "对象类型",
                      render: (_: unknown, row: any) => `${row.type_id} ${row.type_name}`,
                    },
                    { title: "写入条数", dataIndex: "count", width: 100 },
                    {
                      title: "",
                      width: 100,
                      render: (_: unknown, row: any) => (
                        <Button
                          type="link"
                          onClick={() => {
                            closeAnalyze();
                            navigate(`${base}/knowledge/${row.model_code || 1}?type=${encodeURIComponent(row.type_id)}`);
                          }}
                        >
                          去治理
                        </Button>
                      ),
                    },
                  ]}
                />
                <Space>
                  <Button onClick={closeAnalyze}>继续收集下一份</Button>
                  <Button
                    type="primary"
                    onClick={() => {
                      const first = (commitResult.coverage?.types || [])[0];
                      closeAnalyze();
                      if (first) {
                        navigate(`${base}/knowledge/${first.model_code || 1}?type=${encodeURIComponent(first.type_id)}`);
                      }
                    }}
                  >
                    从第一个类型开始治理
                  </Button>
                </Space>
              </>
            ) : null}
          </Space>
        ) : null}
      </Drawer>
      <ExtractCompareModal
        open={!!compareRow}
        row={compareRow}
        sourceId={analyzing?.id}
        onClose={() => setCompareRow(null)}
      />
    </Space>
    </div>
  );
}
