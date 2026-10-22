import {
  AppstoreOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CommentOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Input, Select, Tag, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { workspacePath } from "../paths";
import { useProduct } from "../product";
import { useWorkspace } from "../workspace";

/** 临时首页插画，替换 `public/home-hero.png` 即可。 */
const HERO_SRC = `${import.meta.env.BASE_URL}home-hero.png`.replace(/([^:]\/)\/+/g, "$1");

const SCOPE_MIN = 108;
let tagMeasureCanvas: HTMLCanvasElement | undefined;

/**
 * 按产品名估算标签宽度，尽量贴近真实渲染，避免过早收成 +N。
 * @param {string} name
 */
function measureProductTag(name: string) {
  if (typeof document === "undefined") return 24 + [...name].length * 14;
  tagMeasureCanvas = tagMeasureCanvas || document.createElement("canvas");
  const ctx = tagMeasureCanvas.getContext("2d");
  if (!ctx) return 24 + [...name].length * 14;
  ctx.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, sans-serif";
  return Math.ceil(ctx.measureText(name).width) + 40;
}

/**
 * 未选时最小宽度；选中后按标签变宽，只在左栏剩余空间不够时才收起。
 * @param {number[]} ids
 * @param {{ id: number; name: string }[]} items
 * @param {number} available
 */
function productScopeWidth(ids: number[], items: { id: number; name: string }[], available: number) {
  if (!ids.length) return SCOPE_MIN;
  const chrome = 72;
  const tags = ids.reduce((sum, id) => {
    const name = items.find((item) => item.id === id)?.name || "";
    return sum + measureProductTag(name) + 6;
  }, 0);
  const needed = Math.max(SCOPE_MIN, tags + chrome);
  return Math.min(Math.max(available, SCOPE_MIN), needed);
}

const SUGGESTIONS = [
  { label: "产品对接", question: "两个产品如何对接？" },
  { label: "权限冲突", question: "权限模型和角色是否会冲突？" },
  { label: "订单承接", question: "爱导购代客下单之后，五星经营门户如何承接订单？" },
  { label: "核心流程", question: "已治理知识里，核心业务流程是什么？" },
];

/**
 * 平台首页：问候与能力入口 + 知识问答。
 */
export default function HomePage() {
  const [question, setQuestion] = useState("");
  const [productIds, setProductIds] = useState<number[]>([]);
  const [corpus, setCorpus] = useState<"all" | "governed" | "packed">("governed");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [landscape, setLandscape] = useState<any>(null);
  const { user } = useAuth();
  const { products } = useProduct();
  const { openEntity } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const autoAsked = useRef("");
  const composerRef = useRef<HTMLDivElement | null>(null);
  const scopeRowRef = useRef<HTMLDivElement | null>(null);
  const [scopeAvail, setScopeAvail] = useState(480);
  const scopeWidth = useMemo(
    () => productScopeWidth(productIds, products, scopeAvail),
    [productIds, products, scopeAvail],
  );

  useEffect(() => {
    const row = scopeRowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const corpus = row.querySelector(".pkm-home-composer-corpus");
      const used = (corpus instanceof HTMLElement ? corpus.offsetWidth : 108) + 8;
      setScopeAvail(Math.max(SCOPE_MIN, row.clientWidth - used));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    api.get("/api/landscape").then((res) => setLandscape(res.data)).catch(() => undefined);
  }, []);

  const summary = landscape?.summary || {};
  const entityTotal = products.reduce((sum, item) => sum + (item.entity_count || 0), 0);
  const governedTotal = products.reduce((sum, item) => sum + (item.governed_types || 0), 0);
  const displayName = user?.display_name || user?.username || "同事";

  /**
   * 提交问题。不传 product_ids 时后端检索全部产品。
   * @param {string} [raw]
   */
  const ask = useCallback(
    async (raw?: string) => {
      const q = (raw ?? question).trim();
      if (!q) return;
      setQuestion(q);
      setAsking(true);
      try {
        const res = await api.post("/api/knowledge-ask", {
          question: q,
          product_ids: productIds.length ? productIds : null,
          corpus,
        });
        setResult(res.data);
        if (!res.data.ok && res.data.error) {
          message.warning(res.data.error);
        }
        autoAsked.current = q;
        const next = new URLSearchParams();
        next.set("q", q);
        navigate(`/?${next.toString()}`, { replace: true });
      } catch (err: any) {
        message.error(err?.response?.data?.detail || "问答失败");
      } finally {
        setAsking(false);
      }
    },
    [corpus, navigate, productIds, question],
  );

  useEffect(() => {
    const preset = params.get("q")?.trim() || "";
    if (preset) setQuestion(preset);
  }, [params]);

  useEffect(() => {
    const preset = params.get("q")?.trim() || "";
    if (!preset || autoAsked.current === preset) return;
    autoAsked.current = preset;
    void ask(preset);
    // 仅在带着问题进入首页时自动作答一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const citations = result?.citations || result?.hits || [];

  const actions: { key: string; title: string; desc: string; icon: ReactNode; onClick: () => void }[] = [
    {
      key: "ask",
      title: "知识问答",
      desc: "依据已治理切片跨产品作答",
      icon: <CommentOutlined />,
      onClick: () => composerRef.current?.querySelector("textarea")?.focus(),
    },
    {
      key: "landscape",
      title: "知识全景",
      desc: `${entityTotal} 条实例 · ${governedTotal} 类已治理`,
      icon: <GlobalOutlined />,
      onClick: () => navigate("/landscape"),
    },
    {
      key: "products",
      title: "产品管理",
      desc: `${products.length} 个产品 · ${summary.product_edges || 0} 条关系`,
      icon: <AppstoreOutlined />,
      onClick: () => navigate("/products"),
    },
    {
      key: "skills",
      title: "技能配置",
      desc: "调整抽取与问答所用技能",
      icon: <ThunderboltOutlined />,
      onClick: () => navigate("/skills"),
    },
  ];

  return (
    <div className="pkm-home">
      <div className="pkm-home-main">
        <section className="pkm-home-hero">
          <div className="pkm-home-hero-copy">
            <h1>你好，{displayName}</h1>
            <h2>有什么我可以帮你的吗？</h2>
            <p>依据产品已治理的知识作答。可以跨产品提问，例如两个产品如何对接、权限是否冲突。</p>
          </div>
          <img className="pkm-home-hero-art" src={HERO_SRC} alt="" />
        </section>

        <div className="pkm-home-chips">
          {SUGGESTIONS.map((item) => (
            <button key={item.label} type="button" className="pkm-home-chip" onClick={() => void ask(item.question)}>
              {item.label}
            </button>
          ))}
          <button type="button" className="pkm-home-chip" onClick={() => navigate("/landscape")}>
            知识全景
          </button>
        </div>

        <div className="pkm-home-actions">
          {actions.map((item) => (
            <button key={item.key} type="button" className="pkm-home-action" onClick={item.onClick}>
              <span className="pkm-home-action-icon">{item.icon}</span>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
              <span className="pkm-home-action-go">
                进入 <ArrowRightOutlined />
              </span>
            </button>
          ))}
        </div>

        <section className="pkm-home-chat">
          {result ? (
            <div className="pkm-home-answer">
              <div className="pkm-home-answer-kicker">{result.mode === "retrieve" ? "检索切片（未配置大模型）" : "回答"}</div>
              {result.scope?.length ? (
                <div className="pkm-muted" style={{ marginBottom: 12 }}>
                  检索了 {result.scope.length} 个产品，切片{" "}
                  {result.scope.reduce((sum: number, item: any) => sum + (item.governed_docs || 0), 0)} 篇
                  {result.scope.map((item: any) => (
                    <Tag key={item.id} style={{ marginLeft: 6 }}>
                      {item.name} {item.governed_docs}
                    </Tag>
                  ))}
                </div>
              ) : null}
              <pre className="pkm-code">{result.answer || result.error || "没有回答"}</pre>
              {citations.length ? (
                <div style={{ marginTop: 16 }}>
                  <Typography.Text type="secondary">
                    {corpus === "all" ? "引用内容" : corpus === "packed" ? "引用的知识版本" : "引用的已治理对象"}
                  </Typography.Text>
                  <div className="pkm-pano-rel" style={{ marginTop: 8 }}>
                    {citations.map((item: any) => (
                      <button
                        key={`${item.product_id || ""}-${item.id}`}
                        type="button"
                        className="pkm-pano-rel-item"
                        onClick={() => {
                          const id = Number(item.id);
                          if (Number.isFinite(id) && id > 0) openEntity({ mode: "view", id });
                        }}
                      >
                        {item.product_name ? <Tag>{item.product_name}</Tag> : null}
                        <Tag>{item.type_id}</Tag>
                        <span>{item.title || item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {citations.some((item: any) => item.product_id) ? (
                <Button
                  type="link"
                  style={{ paddingLeft: 0, marginTop: 8 }}
                  onClick={() => {
                    const first = citations.find((item: any) => item.product_id);
                    if (first?.product_id) navigate(workspacePath(first.product_id, "/pack"));
                  }}
                >
                  查看引用产品的模型输入
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="pkm-home-welcome">
              <div className="pkm-home-welcome-mark">知</div>
              <div>
                <strong>你好，我可以按已治理知识回答</strong>
                <p>先选范围，再提问。也可以点下面的问题直接开始。</p>
              </div>
              <div className="pkm-home-prompts">
                {SUGGESTIONS.map((item) => (
                  <button key={item.question} type="button" onClick={() => void ask(item.question)}>
                    {item.question}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="pkm-home-dock">
        <div className="pkm-home-composer" ref={composerRef}>
          <Input.TextArea
            bordered={false}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              corpus === "all"
                ? "问点什么，含草稿与来源原文，内容未必已确认"
                : corpus === "packed"
                  ? "问点什么，仅检索已打成的知识版本"
                  : "问点什么，仅检索已治理知识"
            }
            autoSize={{ minRows: 2, maxRows: 6 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
          />
          <div className="pkm-home-composer-bar">
            <div className="pkm-home-composer-left" ref={scopeRowRef}>
              <Select
                className="pkm-home-composer-corpus"
                size="small"
                value={corpus}
                onChange={(value) => setCorpus(value)}
                options={[
                  { label: "仅治理", value: "governed" },
                  { label: "仅打包", value: "packed" },
                  { label: "含草稿与原文", value: "all" },
                ]}
                popupMatchSelectWidth={false}
                getPopupContainer={() => document.body}
              />
              <Select
                className="pkm-home-composer-scope"
                mode="multiple"
                allowClear
                size="small"
                maxTagCount="responsive"
                maxTagPlaceholder={(omitted) => `+${omitted.length}`}
                placeholder="全部产品"
                value={productIds}
                onChange={(ids) => setProductIds(ids)}
                options={products.map((item) => ({ value: item.id, label: item.name }))}
                style={{ width: scopeWidth }}
                popupMatchSelectWidth={false}
                getPopupContainer={() => document.body}
              />
            </div>
            <Button
              type="primary"
              shape="circle"
              className="pkm-home-send"
              loading={asking}
              icon={<ArrowUpOutlined />}
              aria-label="回答"
              title="回答"
              onClick={() => void ask()}
            />
          </div>
        </div>
        <p className="pkm-home-foot">
          {corpus === "all"
            ? "含草稿与原文：检索活库实例和来源文档，不限是否治理。回答可能依据未确认内容。"
            : corpus === "packed"
              ? "仅打包：只检索已打成的知识版本切片。"
              : "仅治理：检索已治理实例，以及已经打成的知识版本。与对外接口同一口径。"}
        </p>
      </div>
    </div>
  );
}
