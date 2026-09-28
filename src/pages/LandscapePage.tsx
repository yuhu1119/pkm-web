import { Button, Switch, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { workspacePath } from "../paths";
import { useProduct } from "../product";
import { graphColors, useTheme } from "../theme";

const COL_W = 220;
const CARD_W = 196;
const HEAD_H = 72;
const ROW_H = 64;
const PAD = 28;

const REL_COLOR: Record<string, string> = {
  upstream: "#1677ff",
  downstream: "#13c2c2",
  depends: "#d46b08",
  provides: "#52c41a",
  integrates: "#722ed1",
  calls: "#eb2f96",
};

/**
 * 平台级知识全景：产品、功能细分及上下游关系。
 */
export default function LandscapePage() {
  const [data, setData] = useState<any>(null);
  const [showProduct, setShowProduct] = useState(true);
  const [showFeature, setShowFeature] = useState(true);
  const [selected, setSelected] = useState<{ type: "product" | "feature"; id: number } | null>(null);
  const { setCurrentId } = useProduct();
  const navigate = useNavigate();
  const { mode, palette } = useTheme();
  const colors = graphColors(palette, mode);

  const load = () => api.get("/api/landscape").then((res) => setData(res.data));

  useEffect(() => {
    load();
    window.addEventListener("pkm-refresh", load);
    return () => window.removeEventListener("pkm-refresh", load);
  }, []);

  const featureIndex = useMemo(() => {
    const map = new Map<number, { productId: number; col: number; row: number; name: string; kind: string; summary: string }>();
    if (!data) return map;
    data.products.forEach((product: any, col: number) => {
      (product.features || []).forEach((feature: any, row: number) => {
        map.set(feature.id, { productId: product.id, col, row, name: feature.name, kind: feature.kind, summary: feature.summary });
      });
    });
    return map;
  }, [data]);

  if (!data) return null;

  const maxRows = Math.max(1, ...data.products.map((p: any) => (p.features || []).length));
  const width = PAD * 2 + Math.max(1, data.products.length) * COL_W;
  const height = PAD * 2 + HEAD_H + maxRows * ROW_H;
  const selectedProduct = selected?.type === "product" ? data.products.find((p: any) => p.id === selected.id) : null;
  const selectedFeature = selected?.type === "feature" ? featureIndex.get(selected.id) : null;

  /**
   * 计算功能卡片中心。
   */
  const featurePoint = (id: number) => {
    const item = featureIndex.get(id);
    if (!item) return null;
    return { x: PAD + item.col * COL_W + CARD_W / 2, y: PAD + HEAD_H + item.row * ROW_H + 28 };
  };

  /**
   * 计算产品表头中心。
   */
  const productPoint = (col: number) => ({ x: PAD + col * COL_W + CARD_W / 2, y: PAD + 28 });

  return (
    <div className="pkm-pano">
      <header className="pkm-pano-hero">
        <div>
          <div className="pkm-pano-kicker">知识全景</div>
          <h1>产品、功能与上下游关系</h1>
          <p>每个产品列出功能细分。打开图层即可看到产品之间、功能之间的依赖与上下游，形成平台级完整视图。</p>
        </div>
        <div className="pkm-pano-kpis">
          <div className="pkm-pano-kpi">
            <em>{data.summary.product_total}</em>
            <span>产品</span>
          </div>
          <div className="pkm-pano-kpi">
            <em>{data.summary.feature_total}</em>
            <span>功能细分</span>
          </div>
          <div className="pkm-pano-kpi">
            <em>{data.summary.product_edges}</em>
            <span>产品关系</span>
          </div>
          <div className="pkm-pano-kpi">
            <em>{data.summary.feature_edges}</em>
            <span>功能关系</span>
          </div>
        </div>
      </header>
      <div className="pkm-pano-toolbar">
        <div className="pkm-pano-layers">
          <label>
            产品关系
            <Switch size="small" checked={showProduct} onChange={setShowProduct} style={{ marginLeft: 8 }} />
          </label>
          <label>
            功能关系
            <Switch size="small" checked={showFeature} onChange={setShowFeature} style={{ marginLeft: 8 }} />
          </label>
        </div>
        <Button type="link" onClick={() => navigate("/products")}>
          去产品管理维护关系
        </Button>
      </div>
      <div className="pkm-pano-stage">
        <div className="pkm-pano-canvas">
          <svg width={width} height={height}>
            <rect x={0} y={0} width={width} height={height} fill={colors.canvas} />
            {data.products.map((product: any, col: number) => (
              <g key={product.id}>
                <rect x={PAD + col * COL_W - 6} y={PAD} width={CARD_W + 12} height={height - PAD * 2} rx={12} fill={colors.accent} opacity={0.04} />
                <g style={{ cursor: "pointer" }} onClick={() => setSelected({ type: "product", id: product.id })}>
                  <rect
                    x={PAD + col * COL_W}
                    y={PAD}
                    width={CARD_W}
                    height={52}
                    rx={8}
                    fill={colors.card}
                    stroke={selected?.type === "product" && selected.id === product.id ? colors.accent : colors.border}
                    strokeWidth={selected?.type === "product" && selected.id === product.id ? 2 : 1}
                  />
                  <text x={PAD + col * COL_W + 12} y={PAD + 22} fontSize="13" fontWeight="700" fill={colors.text}>
                    {product.name.length > 12 ? `${product.name.slice(0, 11)}…` : product.name}
                  </text>
                  <text x={PAD + col * COL_W + 12} y={PAD + 40} fontSize="10" fill={colors.muted}>
                    {(product.features || []).length} 个功能 · 知识 {product.entity_count || 0}
                  </text>
                </g>
                {(product.features || []).map((feature: any, row: number) => (
                  <g key={feature.id} style={{ cursor: "pointer" }} onClick={() => setSelected({ type: "feature", id: feature.id })}>
                    <rect
                      x={PAD + col * COL_W}
                      y={PAD + HEAD_H + row * ROW_H}
                      width={CARD_W}
                      height={52}
                      rx={8}
                      fill={colors.card}
                      stroke={selected?.type === "feature" && selected.id === feature.id ? colors.accent : colors.border}
                    />
                    <text x={PAD + col * COL_W + 12} y={PAD + HEAD_H + row * ROW_H + 20} fontSize="10" fill={colors.accent}>
                      {feature.kind}
                    </text>
                    <text x={PAD + col * COL_W + 12} y={PAD + HEAD_H + row * ROW_H + 38} fontSize="12" fontWeight="600" fill={colors.text}>
                      {feature.name.length > 12 ? `${feature.name.slice(0, 11)}…` : feature.name}
                    </text>
                  </g>
                ))}
              </g>
            ))}
            {showProduct
              ? data.product_edges.map((edge: any) => {
                  const from = data.products.findIndex((p: any) => p.id === edge.from_id);
                  const to = data.products.findIndex((p: any) => p.id === edge.to_id);
                  if (from < 0 || to < 0) return null;
                  const a = productPoint(from);
                  const b = productPoint(to);
                  return (
                    <path
                      key={`p-${edge.id}`}
                      d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 36} ${b.x} ${b.y}`}
                      fill="none"
                      stroke={REL_COLOR[edge.kind] || "#1677ff"}
                      strokeWidth={2}
                    />
                  );
                })
              : null}
            {showFeature
              ? data.feature_edges.map((edge: any) => {
                  const a = featurePoint(edge.from_id);
                  const b = featurePoint(edge.to_id);
                  if (!a || !b) return null;
                  return (
                    <path
                      key={`f-${edge.id}`}
                      d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 24} ${b.x} ${b.y}`}
                      fill="none"
                      stroke={REL_COLOR[edge.kind] || "#d46b08"}
                      strokeWidth={1.4}
                      strokeDasharray="6 4"
                    />
                  );
                })
              : null}
          </svg>
        </div>
        <aside className="pkm-pano-inspector">
          {selectedProduct ? (
            <>
              <div className="pkm-pano-inspector-head">
                <span>产品</span>
                <strong>{selectedProduct.name}</strong>
              </div>
              <p className="pkm-pano-q">{selectedProduct.description || "暂无说明"}</p>
              <div className="pkm-pano-mini">
                <div>
                  <b>{selectedProduct.entity_count || 0}</b>
                  <span>知识</span>
                </div>
                <div>
                  <b>{(selectedProduct.features || []).length}</b>
                  <span>功能</span>
                </div>
              </div>
              <h4>功能细分</h4>
              {(selectedProduct.features || []).map((item: any) => (
                <div key={item.id} className="pkm-pano-rel-item" onClick={() => setSelected({ type: "feature", id: item.id })}>
                  <Tag>{item.kind}</Tag>
                  <span>{item.name}</span>
                </div>
              ))}
              <div className="pkm-pano-actions">
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    setCurrentId(selectedProduct.id);
                    navigate(workspacePath(selectedProduct.id));
                  }}
                >
                  进入该产品
                </Button>
              </div>
            </>
          ) : selectedFeature ? (
            <>
              <div className="pkm-pano-inspector-head">
                <span>{selectedFeature.kind}</span>
                <strong>{selectedFeature.name}</strong>
              </div>
              <p className="pkm-pano-q">{selectedFeature.summary || "暂无说明"}</p>
              <h4>关联功能</h4>
              {data.feature_edges
                .filter((e: any) => e.from_id === selected?.id || e.to_id === selected?.id)
                .map((edge: any) => (
                  <div key={edge.id} className="pkm-pano-rel-item">
                    <Tag color="orange">{edge.label}</Tag>
                    <span>
                      {edge.from_id === selected?.id ? "指向" : "来自"} {edge.from_id === selected?.id ? edge.to_name : edge.from_name}
                    </span>
                  </div>
                ))}
            </>
          ) : (
            <>
              <div className="pkm-pano-inspector-head">
                <span>知识全景</span>
                <strong>点选产品或功能查看关系</strong>
              </div>
              <p className="pkm-pano-q">实线是产品关系，虚线是功能关系。在产品管理中维护功能细分和上下游，这里只做总览。</p>
              <Typography.Text type="secondary">知识图谱按当前产品查看 78 类对象，可打开实例显示。</Typography.Text>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
