import { Alert, Button, Card, Input, InputNumber, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import GovernanceTag from "../components/GovernanceTag";
import { KNOWLEDGE_MODELS, workspacePath } from "../paths";
import { useProduct } from "../product";

type FeedKind = "rag" | "sft" | "pretrain";

const STEPS = [
  { no: "01", title: "治理完成", desc: "必填完整后点击「治理」。未治理内容不会进入预览。" },
  { no: "02", title: "选定范围", desc: "按一级模型或对象类型缩小要预览的切片。" },
  { no: "03", title: "预览 / 试问", desc: "校验系统提示、命中切片和一次调用是否可推理。" },
];

/**
 * 投喂预览：检查当前已治理知识拼给模型的输入，并试问命中切片。
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
      .then((res) => setPack(res.data))
      .catch(() => {
        message.error("模型输入加载失败");
        setPack({
          product: currentProduct || { name: "产品" },
          summary: { type_total: 0, type_ready: 0, type_ready_scoped: 0, corpus_docs: 0, triples: 0 },
          type_rows: [],
          llm_input: { system_prompt: "", guide: [], rag_preview: "", messages: [] },
        });
      });
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

  if (!pack) return null;

  return (
    <div className="pkm-feed">
      <Card>
        <div className="pkm-feed-hero">
          <div>
            <div className="pkm-feed-kicker">投喂预览</div>
            <h1>{pack.product?.name || currentProduct?.name || "产品"} · 投喂预览</h1>
            <p>
              检查已治理知识拼给模型的输入对不对：系统提示、命中切片、一次调用。未治理内容不会进入预览。
            </p>
          </div>
          <div>
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
                  ? `新增 ${vs.added.length} · 减少 ${vs.removed.length} · 正文变化 ${vs.changed.length}。到知识应用打新版本后，下载才会更新。`
                  : "当前范围与最近冻结版切片一致。"
              }
            />
          ) : (
            <Alert type="info" showIcon message="还没有本产品的冻结版本。预览确认后到「知识应用」打包。" />
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
              确认预览无误后，再到主菜单「知识应用」打成版本并下载。
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
        ]}
      />
    </div>
  );
}
