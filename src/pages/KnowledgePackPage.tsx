import { Alert, Button, Card, Input, InputNumber, Select, Space, Switch, Table, Tabs, Tag, Typography, Upload, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, downloadAuth } from "../api";
import GovernanceTag from "../components/GovernanceTag";
import ImportReviewDrawer from "../components/ImportReviewDrawer";
import { KNOWLEDGE_MODELS, workspacePath } from "../paths";
import { useProduct } from "../product";

type FeedKind = "rag" | "sft" | "pretrain";

const STEPS = [
  { no: "01", title: "治理完成", desc: "对象必填有效并已发布。未治理内容不会进入预览或版本。" },
  { no: "02", title: "选定范围", desc: "按一级模型或对象类型缩小切片，再看模型会读到什么。" },
  { no: "03", title: "预览 / 试问", desc: "看 System Prompt、命中切片和组装后的 messages。" },
  { no: "04", title: "打成版本", desc: "正式下载与对接只走冻结版本，不要用本页的活数据当发货口。" },
];

const RELEASE_FORMATS = [
  { fmt: "system", label: "System Prompt", file: "system-prompt.txt" },
  { fmt: "rag", label: "RAG JSONL", file: "rag-chunks.jsonl" },
  { fmt: "sft", label: "指令微调 JSONL", file: "llm-sft.jsonl" },
  { fmt: "pretrain", label: "预训练 JSONL", file: "llm-pretrain.jsonl" },
  { fmt: "corpus", label: "问答 Markdown", file: "llm-corpus.md" },
];

/**
 * 模型投喂：预览当前已治理知识给模型的输入，试问命中切片，再打成版本下载。
 */
export default function KnowledgePackPage() {
  const [pack, setPack] = useState<any>(null);
  const [kind, setKind] = useState<FeedKind>("rag");
  const [topK, setTopK] = useState(5);
  const [includeTriples, setIncludeTriples] = useState(true);
  const [modelCodes, setModelCodes] = useState<number[]>([]);
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [scopeOnly, setScopeOnly] = useState(false);
  const [question, setQuestion] = useState("");
  const [trial, setTrial] = useState<any>(null);
  const [trialing, setTrialing] = useState(false);
  const [packing, setPacking] = useState(false);
  const [frozen, setFrozen] = useState<any>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const navigate = useNavigate();
  const { current: currentProduct } = useProduct();
  const base = currentProduct?.id ? workspacePath(currentProduct.id) : "/products";

  const filterParams = useMemo(
    () => ({
      include_triples: includeTriples,
      top_k: topK,
      model_codes: modelCodes.length ? modelCodes.join(",") : undefined,
      type_ids: typeIds.length ? typeIds.join(",") : undefined,
    }),
    [includeTriples, topK, modelCodes, typeIds],
  );

  /**
   * 拉取当前范围的投喂预览。
   */
  const load = () => {
    api
      .get("/api/knowledge-pack", { params: filterParams })
      .then((res) => {
        setPack(res.data);
        if (!frozen && res.data?.vs_latest?.release_id) {
          setFrozen({
            id: res.data.vs_latest.release_id,
            version: res.data.vs_latest.version,
            name: res.data.vs_latest.name,
          });
        }
      })
      .catch(() => message.error("模型输入加载失败"));
  };

  useEffect(() => {
    load();
    window.addEventListener("pkm-refresh", load);
    return () => window.removeEventListener("pkm-refresh", load);
  }, [currentProduct?.id, includeTriples, topK, modelCodes.join(","), typeIds.join(",")]);

  const llm = pack?.llm_input;
  const guide = useMemo(() => (llm?.guide || []).find((item: any) => item.key === kind), [llm, kind]);
  const preview = useMemo(() => {
    if (!llm) return "";
    if (kind === "sft") return llm.sft_preview || "";
    if (kind === "pretrain") return llm.pretrain_preview || "";
    return llm.rag_preview || "";
  }, [llm, kind]);
  const assemblyMessages = useMemo(() => {
    if (!llm) return [];
    if (kind === "pretrain") return [];
    if (kind === "sft") return llm.assembly?.sft || llm.sample_chat || [];
    return llm.assembly?.rag || llm.sample_chat || [];
  }, [llm, kind]);

  const typeOptions = useMemo(() => {
    const rows = pack?.type_rows || [];
    return rows
      .filter((item: any) => !modelCodes.length || modelCodes.includes(item.model_code))
      .map((item: any) => ({
        value: item.type_id,
        label: `${item.type_id} ${item.name}`,
      }));
  }, [pack, modelCodes]);

  const tableRows = useMemo(() => {
    const rows = pack?.type_rows || [];
    if (!scopeOnly) return rows;
    return rows.filter((item: any) => item.in_scope !== false);
  }, [pack, scopeOnly]);

  const vs = pack?.vs_latest;
  const summary = pack?.summary || {};
  const recommended = llm?.recommended || "rag";
  const counts = {
    rag: llm?.rag_count || 0,
    sft: llm?.sft_count || 0,
    pretrain: llm?.pretrain_count || 0,
  };

  /**
   * 按当前范围试问。
   */
  const runTrial = async () => {
    if (!question.trim()) {
      message.warning("请输入要试的问题");
      return;
    }
    setTrialing(true);
    try {
      const res = await api.post("/api/knowledge-pack/trial", {
        question: question.trim(),
        top_k: topK,
        include_triples: includeTriples,
        model_codes: modelCodes,
        type_ids: typeIds,
      });
      setTrial(res.data);
      if (!res.data.ok) message.warning(res.data.error || "没有命中");
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "试问失败");
    } finally {
      setTrialing(false);
    }
  };

  /**
   * 把当前预览范围打成冻结版本。
   */
  const packVersion = async () => {
    if (!currentProduct?.id) return;
    setPacking(true);
    try {
      const scoped = modelCodes.length || typeIds.length;
      const res = await api.post("/api/knowledge-releases", {
        scope: "product",
        product_ids: [currentProduct.id],
        name: `${currentProduct.name} 投喂包${scoped ? " · 筛选范围" : ""}`,
        note: scoped ? `筛选模型 ${modelCodes.join(",") || "全部"} / 对象 ${typeIds.join(",") || "按模型"}` : "",
        model_codes: modelCodes,
        type_ids: typeIds,
        include_triples: includeTriples,
      });
      setFrozen(res.data);
      message.success(`已打成 ${res.data.version}，请用下方按钮下载冻结文件`);
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "打包失败");
    } finally {
      setPacking(false);
    }
  };

  if (!pack) return null;

  return (
    <div className="pkm-feed">
      <Card>
        <div className="pkm-feed-hero">
          <div>
            <div className="pkm-feed-kicker">MODEL INPUT</div>
            <h1>{pack.product.name} · 模型投喂</h1>
            <p>
              本页只预览和试问：看当前已治理知识拼成的系统提示、检索切片和一次调用。正式下载、Token 对接请打成知识版本。未治理内容不会进入预览或版本。
            </p>
          </div>
          <div>
            <Button type="primary" loading={packing} onClick={packVersion}>
              打成知识版本
            </Button>
            <Button type="link" onClick={() => navigate("/apps")} style={{ paddingRight: 0 }}>
              去知识应用下载 / 对接
            </Button>
            <div className="pkm-feed-stats">
              <div>
                <b>{counts.rag || summary.corpus_docs || 0}</b>
                <span>当前范围切片</span>
              </div>
              <div>
                <b>
                  {summary.type_ready_scoped ?? summary.type_ready}/
                  {summary.filtered ? (pack.type_rows || []).filter((item: any) => item.in_scope).length : summary.type_total}
                </b>
                <span>已治理对象类</span>
              </div>
              <div>
                <b>{summary.triples || 0}</b>
                <span>关系三元组</span>
              </div>
            </div>
          </div>
        </div>
        <div className="pkm-steps">
          {STEPS.map((step) => (
            <div key={step.no} className="pkm-step">
              <b>STEP {step.no}</b>
              <strong>{step.title}</strong>
              <span>{step.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="投喂范围" style={{ marginTop: 16 }}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <div className="pkm-muted" style={{ marginBottom: 8 }}>
              一级模型（可多选；不选表示全部）
            </div>
            <Select
              mode="multiple"
              allowClear
              style={{ minWidth: 360, width: "100%" }}
              placeholder="全部十大模型"
              value={modelCodes}
              onChange={(values) => {
                setModelCodes(values);
                if (!values.length) return;
                const allow = new Set(
                  (pack?.type_rows || [])
                    .filter((row: any) => values.includes(row.model_code))
                    .map((row: any) => row.type_id),
                );
                setTypeIds((prev) => prev.filter((id) => allow.has(id)));
              }}
              options={KNOWLEDGE_MODELS.map((item) => ({ value: item.code, label: `${item.code} ${item.name}` }))}
            />
          </div>
          <div>
            <div className="pkm-muted" style={{ marginBottom: 8 }}>
              对象类型（可再缩小；不选表示上方模型下全部类型）
            </div>
            <Select
              mode="multiple"
              allowClear
              style={{ minWidth: 360, width: "100%" }}
              placeholder="该范围内全部对象类型"
              value={typeIds}
              onChange={setTypeIds}
              options={typeOptions}
              optionFilterProp="label"
            />
          </div>
          <Space wrap>
            <div>
              <div className="pkm-muted" style={{ marginBottom: 8 }}>
                试问 / 组装 Top-K
              </div>
              <InputNumber min={1} max={20} value={topK} onChange={(value) => setTopK(Number(value || 5))} />
            </div>
            <div>
              <div className="pkm-muted" style={{ marginBottom: 8 }}>
                写入关系三元组
              </div>
              <Switch checked={includeTriples} onChange={setIncludeTriples} />
            </div>
          </Space>
          {summary.filtered ? <Tag color="blue">已按范围过滤切片</Tag> : <Tag>当前为全部已治理对象</Tag>}
        </Space>
      </Card>

      {vs ? (
        <Card title="相对最近冻结版" style={{ marginTop: 16 }}>
          {vs.has_release ? (
            <Alert
              type={vs.added?.length || vs.removed?.length || vs.changed?.length ? "warning" : "success"}
              showIcon
              message={`${vs.version} ${vs.name || ""}`.trim()}
              description={
                vs.added?.length || vs.removed?.length || vs.changed?.length
                  ? `新增 ${vs.added.length} · 减少 ${vs.removed.length} · 正文变化 ${vs.changed.length}。打新版本后，知识应用里的下载才会更新。`
                  : "当前范围与最近冻结版切片一致。"
              }
            />
          ) : (
            <Alert type="info" showIcon message="还没有本产品的冻结版本。预览确认后点「打成知识版本」。" />
          )}
          {vs.has_release && (vs.added?.length || vs.removed?.length || vs.changed?.length) ? (
            <Table
              style={{ marginTop: 12 }}
              size="small"
              pagination={false}
              rowKey={(row) => `${row.kind}-${row.id}`}
              dataSource={[
                ...(vs.added || []).map((item: any) => ({ ...item, kind: "新增" })),
                ...(vs.removed || []).map((item: any) => ({ ...item, kind: "减少" })),
                ...(vs.changed || []).map((item: any) => ({ ...item, kind: "变化" })),
              ]}
              columns={[
                { title: "变化", dataIndex: "kind", width: 80 },
                { title: "对象", dataIndex: "type_id", width: 100 },
                { title: "切片", dataIndex: "title" },
              ]}
            />
          ) : null}
        </Card>
      ) : null}

      <Card title="试问一次调用" style={{ marginTop: 16 }}>
        <p className="pkm-muted" style={{ marginTop: 0 }}>
          输入问题，看当前范围会命中哪些切片、组装后的 messages 是什么。这里不调用大模型，也不写版本。
        </p>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如：这个产品服务谁？导购在哪一页下单？"
            onPressEnter={runTrial}
          />
          <Button type="primary" loading={trialing} onClick={runTrial}>
            试问
          </Button>
        </Space.Compact>
        {trial?.ok ? (
          <div style={{ marginTop: 16 }}>
            <div className="pkm-muted" style={{ marginBottom: 8 }}>
              从 {trial.total} 条切片中取 Top-{trial.top_k}
            </div>
            <Table
              size="small"
              pagination={false}
              rowKey={(row) => `${row.type_id}-${row.id}`}
              dataSource={trial.hits || []}
              columns={[
                { title: "对象", width: 160, render: (_: unknown, row: any) => `${row.type_id} ${row.type_name || ""}` },
                { title: "切片", dataIndex: "title" },
                { title: "核心问句", dataIndex: "question", ellipsis: true },
              ]}
            />
            <div className="pkm-chat" style={{ marginTop: 12 }}>
              {(trial.assembly || []).map((msg: any, idx: number) => (
                <div key={idx} className={`pkm-chat-row ${msg.role}`}>
                  <span>{msg.role}</span>
                  <pre>{msg.content}</pre>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <Card title="冻结后下载" style={{ marginTop: 16 }}>
        {frozen?.id ? (
          <>
            <p className="pkm-muted" style={{ marginTop: 0 }}>
              当前可下载 {frozen.version}（冻结文件，不会随之后的治理改动）。对接请到知识应用用 Token 拉同一版本。
            </p>
            <Space wrap>
              {RELEASE_FORMATS.map((item) => (
                <Button
                  key={item.fmt}
                  type={item.fmt === kind ? "primary" : "default"}
                  onClick={() => downloadAuth(`/api/knowledge-releases/${frozen.id}/download?fmt=${item.fmt}`, `${frozen.version}-${item.file}`)}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
          </>
        ) : (
          <p className="pkm-muted" style={{ marginTop: 0 }}>
            还没有可下载的冻结版。预览和试问满意后，点右上角「打成知识版本」。
          </p>
        )}
      </Card>

      <Card title="用途说明" style={{ marginTop: 16 }}>
        <Select
          value={kind}
          style={{ width: 220 }}
          onChange={(value) => setKind(value)}
          options={[
            { value: "rag", label: recommended === "rag" ? "RAG 检索增强（建议）" : "RAG 检索增强" },
            { value: "sft", label: recommended === "sft" ? "指令微调（建议）" : "指令微调" },
            { value: "pretrain", label: "继续预训练" },
          ]}
        />
        {guide ? (
          <div className="pkm-feed-guide">
            <p>
              <strong>何时用：</strong>
              {guide.when}
            </p>
            <p>
              <strong>模型输入：</strong>
              {guide.input}
              {kind === "rag" ? ` 建议 Top-K = ${topK}。` : ""}
              {!includeTriples ? " 当前未写入关系三元组。" : ""}
            </p>
            <p>
              <strong>下一步：</strong>
              打成版本后下载对应文件，或在知识应用用 Token 拉取。
            </p>
          </div>
        ) : null}
      </Card>

      <Tabs
        style={{ marginTop: 16 }}
        items={[
          {
            key: "prompt",
            label: "System Prompt",
            children: (
              <Card>
                <Typography.Paragraph type="secondary">对话时把这段作为系统消息。范围与三元组开关会改变这段内容。</Typography.Paragraph>
                <pre className="pkm-code">{llm?.system_prompt || "暂无已治理内容，无法生成系统提示。"}</pre>
              </Card>
            ),
          },
          {
            key: "preview",
            label: "模型将读到的内容",
            children: (
              <Card>
                <Typography.Paragraph type="secondary">
                  {kind === "rag"
                    ? "向量库切片预览（含 metadata）。"
                    : kind === "sft"
                      ? "指令微调 JSONL 预览。"
                      : "继续预训练纯文本预览。"}
                  仅展示前 2 条；完整文件请下载冻结版本。
                </Typography.Paragraph>
                <pre className="pkm-code">{preview || "暂无已治理切片。请先发布完整实例，或放宽筛选范围。"}</pre>
              </Card>
            ),
          },
          {
            key: "assembly",
            label: "组装后的一次调用",
            children: (
              <Card>
                <Typography.Paragraph type="secondary">
                  {kind === "pretrain"
                    ? "继续预训练没有 chat messages。"
                    : kind === "rag"
                      ? `默认用第一条核心问句和 Top-${topK} 切片演示。要看真实问题请用上方试问。`
                      : "指令微调后，推理时 messages 与训练样本同构。"}
                </Typography.Paragraph>
                {kind === "pretrain" ? (
                  <pre className="pkm-code">{llm?.assembly?.pretrain || "暂无预训练样本。"}</pre>
                ) : (
                  <div className="pkm-chat">
                    {assemblyMessages.map((msg: any, idx: number) => (
                      <div key={idx} className={`pkm-chat-row ${msg.role}`}>
                        <span>{msg.role}</span>
                        <pre>{msg.content}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: "cover",
            label: "尚未进入投喂",
            children: (
              <Card
                extra={
                  <Space>
                    <span className="pkm-muted">只看当前范围</span>
                    <Switch checked={scopeOnly} onChange={setScopeOnly} />
                  </Space>
                }
                bodyStyle={{ padding: 0 }}
              >
                <Table
                  rowKey="type_id"
                  size="small"
                  pagination={false}
                  scroll={{ y: 420 }}
                  dataSource={tableRows}
                  columns={[
                    { title: "对象", render: (_: any, r: any) => `${r.type_id} ${r.name}`, width: 220 },
                    { title: "模型", dataIndex: "model_name", width: 140 },
                    { title: "核心问句", dataIndex: "core_question", ellipsis: true },
                    {
                      title: "能否投喂",
                      width: 120,
                      render: (_: any, r: any) => (r.ready ? <Tag color="success">已进入</Tag> : <Tag>未进入</Tag>),
                    },
                    {
                      title: "状态",
                      width: 160,
                      render: (_: any, r: any) => <GovernanceTag stage={r.stage} completeness={r.completeness} />,
                    },
                    {
                      title: "去治理",
                      width: 90,
                      render: (_: any, r: any) => (
                        <Button type="link" onClick={() => navigate(`${base}/knowledge/${r.model_code}?type=${r.type_id}`)}>
                          打开
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: "io",
            label: "填写模版",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="给人填的模版">
                  <div className="pkm-muted" style={{ marginBottom: 12 }}>
                    给产品经理的结构模版，不是给模型的语料。
                  </div>
                  <Button onClick={() => downloadAuth("/api/templates-bundle", "knowledge-templates.zip")}>下载全部模版包</Button>
                </Card>
                <Card title="实例表导入">
                  <div className="pkm-muted" style={{ marginBottom: 12 }}>
                    用 Excel 维护实例。导入会先对照，不是模型投喂文件。
                  </div>
                  <Space wrap>
                    <Button onClick={() => downloadAuth("/api/export?fmt=csv", "knowledge.csv")}>导出 CSV</Button>
                    <Upload
                      showUploadList={false}
                      accept=".json"
                      customRequest={async ({ file, onSuccess, onError }) => {
                        try {
                          const text = await (file as File).text();
                          const payload = JSON.parse(text);
                          const res = await api.post("/api/import/preview", Array.isArray(payload) ? { items: payload } : payload);
                          setImportPreview(res.data);
                          onSuccess && onSuccess({}, new XMLHttpRequest());
                        } catch (e) {
                          message.error("导入失败，本期请使用 JSON");
                          onError && onError(e as Error);
                        }
                      }}
                    >
                      <Button>导入 JSON</Button>
                    </Upload>
                  </Space>
                </Card>
              </Space>
            ),
          },
        ]}
      />
      <ImportReviewDrawer
        open={!!importPreview}
        preview={importPreview}
        onClose={() => setImportPreview(null)}
        onApplied={load}
      />
    </div>
  );
}
