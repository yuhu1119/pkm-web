import { Button, Card, Input, Select, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { workspacePath } from "../paths";
import { useProduct } from "../product";
import { useWorkspace } from "../workspace";

/**
 * 平台级知识问答：Playground 式输入区，默认检索全部产品已治理知识。
 */
export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [productIds, setProductIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { products } = useProduct();
  const { openEntity } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const preset = params.get("q");
    if (preset) setQuestion(preset);
  }, [params]);

  const scopeLabel = useMemo(() => {
    if (!productIds.length) return "全部产品";
    const names = products.filter((item) => productIds.includes(item.id)).map((item) => item.name);
    return names.join("、") || "全部产品";
  }, [productIds, products]);

  /**
   * 提交问题。不传 product_ids 时后端检索全部产品。
   */
  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await api.post("/api/knowledge-ask", {
        question: q,
        product_ids: productIds.length ? productIds : null,
      });
      setResult(res.data);
      if (!res.data.ok && res.data.error) {
        message.warning(res.data.error);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "问答失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pkm-feed" style={{ maxWidth: 860 }}>
      <div className="pkm-page-kicker">Playground</div>
      <h1 className="pkm-page-title">知识问答</h1>
      <p className="pkm-page-desc">
        依据公司已治理的产品知识作答。问题可以跨产品，例如两个产品如何对接、权限是否冲突。
      </p>

      <Card style={{ marginTop: 24 }}>
        <div className="pkm-muted" style={{ marginBottom: 8 }}>
          检索范围 · 当前 {scopeLabel}
        </div>
        <Select
          mode="multiple"
          allowClear
          placeholder="默认全部产品，可缩小到若干产品"
          value={productIds}
          onChange={(ids) => setProductIds(ids)}
          options={products.map((item) => ({ value: item.id, label: item.name }))}
          style={{ width: "100%" }}
        />
        <div className="pkm-ask-composer">
          <Input.TextArea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如：爱导购代客下单之后，五星经营门户如何承接订单？"
            autoSize={{ minRows: 4, maxRows: 8 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <Button type="primary" loading={loading} onClick={ask}>
              依据已治理知识回答
            </Button>
          </div>
        </div>
      </Card>

      {result ? (
        <Card title={result.mode === "retrieve" ? "检索切片（未配置大模型）" : "回答"} style={{ marginTop: 16 }}>
          {result.scope?.length ? (
            <div className="pkm-muted" style={{ marginBottom: 12 }}>
              检索了 {result.scope.length} 个产品，已治理切片{" "}
              {result.scope.reduce((sum: number, item: any) => sum + (item.governed_docs || 0), 0)} 篇
              {result.scope.map((item: any) => (
                <Tag key={item.id} style={{ marginLeft: 6 }}>
                  {item.name} {item.governed_docs}
                </Tag>
              ))}
            </div>
          ) : null}
          <pre className="pkm-code">{result.answer || result.error || "没有回答"}</pre>
          {result.citations?.length ? (
            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary">引用的已治理对象</Typography.Text>
              <div className="pkm-pano-rel" style={{ marginTop: 8 }}>
                {result.citations.map((item: any) => (
                  <button
                    key={`${item.product_id || ""}-${item.id}`}
                    type="button"
                    className="pkm-pano-rel-item"
                    onClick={() => openEntity({ mode: "view", id: item.id })}
                  >
                    {item.product_name ? <Tag>{item.product_name}</Tag> : null}
                    <Tag>{item.type_id}</Tag>
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {result.citations?.some((item: any) => item.product_id) ? (
            <Button
              type="link"
              style={{ paddingLeft: 0, marginTop: 8 }}
              onClick={() => {
                const first = result.citations.find((item: any) => item.product_id);
                if (first?.product_id) navigate(workspacePath(first.product_id, "/pack"));
              }}
            >
              查看引用产品的模型输入
            </Button>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
