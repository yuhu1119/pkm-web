import { AimOutlined, CloseOutlined, MinusOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Progress, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { CAP_HINTS, canWriteProduct, hasCap, useAuth } from "../auth";
import CapAction from "../components/CapAction";
import GovernanceTag from "../components/GovernanceTag";
import { workspacePath } from "../paths";
import { useProduct } from "../product";
import { graphColors, useTheme } from "../theme";
import { useWorkspace } from "../workspace";

const COL_W = 168;
const HEAD_H = 76;
const MODEL_HEAD_H = 52;
const PAD_X = 28;
const PAD_Y = 20;
const CARD_W = 148;
const CARD_INFO_H = 56;
const TAG_TOP_GAP = 14;
const CARD_HEAD = CARD_INFO_H + TAG_TOP_GAP;
const TAG_FONT = 9;
const TAG_PAD_X = 4;
const TAG_GAP = 4;
const TAG_INNER_W = CARD_W - 16;
const DOT_X = 14;
const DOT_Y = 14;

const MODEL_COLOR = ["#10a37f", "#3b82c4", "#7c6aed", "#d29922", "#e05d6f", "#0d8a6a", "#5b8def", "#c47a3a", "#6e6e80", "#2a9d8f"];

/** 对象结构线。 */
const TYPE_LAYERS = [
  { key: "ref", label: "结构引用", color: "#3b82c4" },
  { key: "impact", label: "变更联动", color: "#d29922" },
  { key: "model_impact", label: "模型联动", color: "#e05d6f" },
] as const;

/** 实例关系：颜色对应功能定义，可单独开关。 */
const INST_REL_META: Record<string, { label: string; color: string }> = {
  引用: { label: "引用", color: "#3b82c4" },
  关联: { label: "关联", color: "#10a37f" },
  依赖: { label: "依赖", color: "#d29922" },
  调用: { label: "调用", color: "#7c6aed" },
  上下游: { label: "上下游", color: "#e05d6f" },
  协作: { label: "协作", color: "#0d8a6a" },
  归属: { label: "归属", color: "#c47a3a" },
  触发: { label: "触发", color: "#5b8def" },
};

/** 功能关系：与产品「功能与关系」定义一致。 */
const FEAT_REL_META: Record<string, { label: string; color: string }> = {
  upstream: { label: "上游", color: "#3b82c4" },
  downstream: { label: "下游", color: "#10a37f" },
  depends: { label: "依赖", color: "#d29922" },
  provides: { label: "能力输出", color: "#0d8a6a" },
  integrates: { label: "集成协同", color: "#7c6aed" },
  calls: { label: "调用", color: "#e05d6f" },
};

const MODE_HINT = { off: "关", focus: "经过", all: "全部" } as const;

type LayerMode = "off" | "focus" | "all";

interface PanoramaNode {
  type_id: string;
  name: string;
  model_code: number;
  model_name: string;
  knowledge_kind: string;
  core_question: string;
  ai_value?: string;
  change_note: string;
  row: number;
  status: string;
  instance_count: number;
  source_count?: number;
  completeness?: number;
  related_count?: number;
  titles: { id: number; name: string; status: string; stage?: string; completeness?: number; steward_name?: string; steward_role?: string }[];
}

interface PanoramaEdge {
  source: string;
  target: string;
  kind: string;
  label: string;
}

interface GraphEdge {
  source: number;
  target: number;
  relation: string;
}

interface FeatEdge {
  source: number;
  target: number;
  kind: string;
  label: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 图层三态循环：关闭 → 经过对象 → 全部。
 * @param {LayerMode} mode
 */
function nextMode(mode: LayerMode): LayerMode {
  if (mode === "off") return "focus";
  if (mode === "focus") return "all";
  return "off";
}

/**
 * 实例关系配色；未登记的定义用固定备用色。
 * @param {string} rel
 */
function instRelMeta(rel: string) {
  return INST_REL_META[rel] || INST_REL_META[rel.replace(/^被引用\//, "")] || { label: rel || "引用", color: "#6e6e80" };
}

/**
 * 生成上拱贝塞尔曲线。
 */
function curvePath(x1: number, y1: number, x2: number, y2: number, lift: number) {
  const dx = x2 - x1;
  const cx = (x1 + x2) / 2;
  const cy = Math.min(y1, y2) - Math.max(24, Math.abs(dx) * lift);
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function modelCodeOfTarget(target: string) {
  return target.startsWith("M") ? Number(target.slice(1)) : 0;
}

function boxCenter(box: Box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/**
 * 对象关系线的端点：卡片 ID 前的彩色实心圆点。
 * @param {Box} box
 */
function objectDot(box: Box) {
  return { x: box.x + DOT_X, y: box.y + DOT_Y };
}

/**
 * HEX 转 rgba，用于模型色带与半透明分隔线。
 * @param {string} hex
 * @param {number} alpha
 */
function hexRgba(hex: string, alpha: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * 按卡片宽度裁切标题，超出显示省略号。
 * @param {string} name
 * @param {number} maxW
 * @param {number} fontSize
 */
function fitLabel(name: string, maxW: number, fontSize: number) {
  if (measureText(name, fontSize) <= maxW) return name;
  let text = name;
  while (text.length > 1 && measureText(`${text}…`, fontSize) > maxW) text = text.slice(0, -1);
  return `${text}…`;
}

interface InstTagLayout {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

/**
 * 估算标签文字宽度：中文按字号，西文约 0.55em。
 * @param {string} text
 * @param {number} [fontSize]
 */
function measureText(text: string, fontSize = TAG_FONT) {
  let width = 0;
  for (const ch of text) {
    width += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.56;
  }
  return width;
}

/**
 * 名称超出宽度时拆成最多两行，第二行仍超则省略。
 * @param {string} name
 * @param {number} maxInner
 */
function wrapName(name: string, maxInner: number) {
  if (measureText(name) <= maxInner) return [name];
  const lines = ["", ""];
  let row = 0;
  for (const ch of name) {
    if (measureText(lines[row] + ch) <= maxInner) {
      lines[row] += ch;
      continue;
    }
    if (row === 0) {
      row = 1;
      lines[1] += ch;
      continue;
    }
    lines[1] = `${lines[1].slice(0, Math.max(0, lines[1].length - 1))}…`;
    break;
  }
  return lines[1] ? lines : [lines[0]];
}

/**
 * 单标签尺寸：字少则收窄，一行放不下则两行折行。
 * @param {string} name
 * @param {number} maxW
 */
function sizeTag(name: string, maxW: number) {
  const innerMax = Math.max(12, maxW - TAG_PAD_X * 2);
  const oneW = measureText(name) + TAG_PAD_X * 2;
  if (oneW <= maxW) {
    return { w: Math.min(maxW, Math.max(22, Math.ceil(oneW))), h: 16, lines: [name] };
  }
  const lines = wrapName(name, innerMax);
  return { w: maxW, h: lines.length > 1 ? 28 : 16, lines };
}

/**
 * 在卡片内弹性排布全部实例标签：短名同一行并排，放不下再换行。
 * @param {{id:number,name:string}[]} titles
 */
function packInstanceTags(titles: { id: number; name: string }[]) {
  const tags: InstTagLayout[] = [];
  let x = 0;
  let y = 0;
  let rowH = 16;
  for (const item of titles) {
    const natural = Math.min(TAG_INNER_W, Math.max(22, Math.ceil(measureText(item.name) + TAG_PAD_X * 2)));
    const remain = TAG_INNER_W - x;
    if (x > 0 && natural > remain) {
      x = 0;
      y += rowH + TAG_GAP;
      rowH = 16;
    }
    const sized = sizeTag(item.name, x === 0 ? TAG_INNER_W : TAG_INNER_W - x);
    tags.push({ id: item.id, x, y, w: sized.w, h: sized.h, lines: sized.lines });
    x += sized.w + TAG_GAP;
    rowH = Math.max(rowH, sized.h);
  }
  return { tags, height: tags.length ? y + rowH : 0 };
}

/**
 * 产品知识图谱：对象卡片内嵌实例标签，图层三态控制连线。
 */
export default function PanoramaPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [featEdges, setFeatEdges] = useState<FeatEdge[]>([]);
  const [selected, setSelected] = useState("");
  const [hovered, setHovered] = useState("");
  const [selectedInst, setSelectedInst] = useState<number | null>(null);
  const [hoveredInst, setHoveredInst] = useState<number | null>(null);
  const [typeMode, setTypeMode] = useState<Record<string, LayerMode>>({
    ref: "focus",
    impact: "focus",
    model_impact: "focus",
  });
  const [instMode, setInstMode] = useState<LayerMode>("focus");
  const [featMode, setFeatMode] = useState<LayerMode>("focus");
  const [instKindOn, setInstKindOn] = useState<Record<string, boolean>>({});
  const [featKindOn, setFeatKindOn] = useState<Record<string, boolean>>({});
  const [showInst, setShowInst] = useState(false);
  const [view, setView] = useState({ x: 24, y: 16, k: 1 });
  const [panning, setPanning] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const shouldCenterRef = useRef(true);
  const navigate = useNavigate();
  const { current } = useProduct();
  const writable = canWriteProduct(user, current);
  const { openEntity } = useWorkspace();
  const { mode, palette } = useTheme();
  const colors = graphColors(palette, mode);
  const statusMeta = colors.status;
  const base = current?.id ? workspacePath(current.id) : "/products";

  const load = () => {
    api
      .get("/api/panorama")
      .then((res) =>
        setData({
          nodes: res.data?.nodes || [],
          edges: res.data?.edges || [],
          models: res.data?.models || [],
          summary: res.data?.summary || {},
        }),
      )
      .catch(() => setData({ nodes: [], edges: [], models: [], summary: {} }));
    api.get("/api/graph").then((res) => setGraphEdges(res.data.edges || [])).catch(() => setGraphEdges([]));
    if (!current?.id) return;
    Promise.all([api.get(`/api/products/${current.id}/features`), api.get("/api/feature-relations")])
      .then(([featRes, relRes]) => {
        const entityOf = new Map<number, number>();
        (featRes.data || []).forEach((item: any) => {
          if (item.entity_id) entityOf.set(item.id, item.entity_id);
        });
        const mapped: FeatEdge[] = [];
        (relRes.data || []).forEach((item: any) => {
          const source = entityOf.get(item.from_id);
          const target = entityOf.get(item.to_id);
          if (!source || !target) return;
          mapped.push({ source, target, kind: item.kind || "depends", label: item.label || FEAT_REL_META[item.kind]?.label || "依赖" });
        });
        setFeatEdges(mapped);
      })
      .catch(() => setFeatEdges([]));
  };

  useEffect(() => {
    load();
    window.addEventListener("pkm-refresh", load);
    return () => window.removeEventListener("pkm-refresh", load);
  }, [current?.id]);

  const nodes: PanoramaNode[] = data?.nodes || [];
  const edges: PanoramaEdge[] = data?.edges || [];

  const instById = useMemo(() => {
    const map = new Map<number, { type_id: string; name: string }>();
    nodes.forEach((node) => (node.titles || []).forEach((item) => map.set(item.id, { type_id: node.type_id, name: item.name })));
    return map;
  }, [nodes]);

  const instKinds = useMemo(() => {
    const set = new Set<string>();
    graphEdges.forEach((edge) => set.add(edge.relation || "引用"));
    return [...set];
  }, [graphEdges]);

  const featKinds = useMemo(() => {
    const set = new Set<string>();
    featEdges.forEach((edge) => set.add(edge.kind || "depends"));
    return [...set];
  }, [featEdges]);

  useEffect(() => {
    setInstKindOn((prev) => {
      const next = { ...prev };
      instKinds.forEach((kind) => {
        if (next[kind] === undefined) next[kind] = true;
      });
      return next;
    });
  }, [instKinds]);

  useEffect(() => {
    setFeatKindOn((prev) => {
      const next = { ...prev };
      featKinds.forEach((kind) => {
        if (next[kind] === undefined) next[kind] = true;
      });
      return next;
    });
  }, [featKinds]);

  const layout = useMemo(() => {
    const typeBox = new Map<string, Box>();
    const instBox = new Map<number, Box>();
    const instAnchor = new Map<number, Box>();
    const instTags = new Map<number, InstTagLayout>();
    const extraByType = new Map<string, number>();
    const packByType = new Map<string, ReturnType<typeof packInstanceTags>>();
    const cardH = new Map<string, number>();
    nodes.forEach((node) => {
      const packed = showInst ? packInstanceTags(node.titles || []) : { tags: [] as InstTagLayout[], height: 0 };
      packByType.set(node.type_id, packed);
      extraByType.set(node.type_id, showInst ? Math.max(0, node.instance_count - packed.tags.length) : 0);
      cardH.set(node.type_id, packed.height ? CARD_HEAD + packed.height + 10 : CARD_INFO_H + 8);
    });
    const rowMax = new Map<number, number>();
    nodes.forEach((node) => {
      const height = cardH.get(node.type_id) || CARD_HEAD;
      rowMax.set(node.row, Math.max(rowMax.get(node.row) || 0, height + 16));
    });
    const rowY = new Map<number, number>();
    let acc = PAD_Y + HEAD_H;
    const lastRow = nodes.reduce((max, node) => Math.max(max, node.row), 0);
    for (let row = 0; row <= lastRow; row += 1) {
      rowY.set(row, acc);
      acc += rowMax.get(row) || 120;
    }
    nodes.forEach((node) => {
      const x = PAD_X + (node.model_code - 1) * COL_W;
      const y = rowY.get(node.row) || acc;
      const card = { x, y, w: CARD_W, h: cardH.get(node.type_id) || CARD_HEAD };
      typeBox.set(node.type_id, card);
      const packed = packByType.get(node.type_id);
      packed?.tags.forEach((tag) => {
        const box = { x: x + 8 + tag.x, y: y + CARD_HEAD + tag.y, w: tag.w, h: tag.h };
        instBox.set(tag.id, box);
        instAnchor.set(tag.id, box);
        instTags.set(tag.id, { ...tag, x: box.x, y: box.y });
      });
      (node.titles || []).forEach((item) => {
        if (!instAnchor.has(item.id)) instAnchor.set(item.id, card);
      });
    });
    return {
      typeBox,
      instBox,
      instAnchor,
      instTags,
      extraByType,
      width: PAD_X * 2 + 10 * COL_W,
      height: acc + PAD_Y,
    };
  }, [nodes, showInst]);

  const focusType = selected || hovered;
  const focusInst = selectedInst || hoveredInst;

  const visibleTypeEdges = useMemo(() => {
    if (selectedInst) return [];
    return edges.filter((edge) => {
      const modeNow = typeMode[edge.kind] || "off";
      if (modeNow === "off") return false;
      if (selected) return edge.source === selected || edge.target === selected;
      if (modeNow === "all") return true;
      if (!focusType) return false;
      return edge.source === focusType || edge.target === focusType;
    });
  }, [edges, typeMode, focusType, selected, selectedInst]);

  const visibleInstEdges = useMemo(() => {
    if (!showInst && !selectedInst) return [];
    if (selected && !selectedInst) return [];
    if (instMode === "off" && !selectedInst) return [];
    return graphEdges.filter((edge) => {
      if (!layout.instAnchor.has(edge.source) || !layout.instAnchor.has(edge.target)) return false;
      if (instKindOn[edge.relation || "引用"] === false) return false;
      if (selectedInst) return edge.source === selectedInst || edge.target === selectedInst;
      if (instMode === "all") return true;
      if (focusInst) return edge.source === focusInst || edge.target === focusInst;
      if (focusType) {
        const s = instById.get(edge.source);
        const t = instById.get(edge.target);
        return s?.type_id === focusType || t?.type_id === focusType;
      }
      return false;
    });
  }, [graphEdges, instMode, instKindOn, layout.instAnchor, selected, selectedInst, focusInst, focusType, instById, showInst]);

  const visibleFeatEdges = useMemo(() => {
    if (selectedInst || selected) return [];
    if (featMode === "off") return [];
    return featEdges.filter((edge) => {
      if (featKindOn[edge.kind] === false) return false;
      const sType = instById.get(edge.source)?.type_id;
      const tType = instById.get(edge.target)?.type_id;
      if (featMode === "all") return true;
      if (focusInst) return edge.source === focusInst || edge.target === focusInst;
      if (!focusType) return false;
      return sType === focusType || tType === focusType;
    });
  }, [featEdges, featMode, featKindOn, selected, selectedInst, focusInst, focusType, instById]);

  const relatedTypes = useMemo(() => {
    const ids = new Set<string>();
    if (focusType) ids.add(focusType);
    visibleTypeEdges.forEach((edge) => {
      ids.add(edge.source);
      ids.add(edge.target);
    });
    visibleInstEdges.forEach((edge) => {
      const s = instById.get(edge.source);
      const t = instById.get(edge.target);
      if (s) ids.add(s.type_id);
      if (t) ids.add(t.type_id);
    });
    visibleFeatEdges.forEach((edge) => {
      const s = instById.get(edge.source);
      const t = instById.get(edge.target);
      if (s) ids.add(s.type_id);
      if (t) ids.add(t.type_id);
    });
    return ids;
  }, [focusType, visibleTypeEdges, visibleInstEdges, visibleFeatEdges, instById]);

  const relatedInstIds = useMemo(() => {
    const ids = new Set<number>();
    if (focusInst) ids.add(focusInst);
    visibleInstEdges.forEach((edge) => {
      ids.add(edge.source);
      ids.add(edge.target);
    });
    return ids;
  }, [focusInst, visibleInstEdges]);

  const litModels = useMemo(() => {
    const codes = new Set<number>();
    const modeNow = typeMode.model_impact;
    if (modeNow === "off") return codes;
    for (const edge of edges) {
      if (edge.kind !== "model_impact") continue;
      const active = modeNow === "all" || (focusType && (edge.source === focusType || edge.target === focusType));
      if (!active) continue;
      const code = modelCodeOfTarget(edge.target);
      if (code) codes.add(code);
    }
    return codes;
  }, [edges, typeMode.model_impact, focusType]);

  /**
   * 缩放并保持光标下的世界坐标不变。
   */
  const zoomTo = useCallback((nextK: number, cx?: number, cy?: number) => {
    const k = Math.min(2.6, Math.max(0.22, nextK));
    const el = canvasRef.current;
    const mx = cx ?? (el ? el.clientWidth / 2 : 0);
    const my = cy ?? (el ? el.clientHeight / 2 : 0);
    setView((prev) => {
      const wx = (mx - prev.x) / prev.k;
      const wy = (my - prev.y) / prev.k;
      return { k, x: mx - wx * k, y: my - wy * k };
    });
  }, []);

  /**
   * 按左栏窗口把图谱缩放到可见范围，并上下左右居中。
   */
  const centerGraph = useCallback(() => {
    const el = canvasRef.current;
    if (!el || !layout.width || !layout.height) return;
    if (el.clientWidth < 8 || el.clientHeight < 8) return;
    const pad = 28;
    const k = Math.min(2.6, Math.max(0.22, Math.min((el.clientWidth - pad * 2) / layout.width, (el.clientHeight - pad * 2) / layout.height, 1)));
    setView({
      k,
      x: (el.clientWidth - layout.width * k) / 2,
      y: (el.clientHeight - layout.height * k) / 2,
    });
  }, [layout.width, layout.height]);

  const fitView = useCallback(() => {
    centerGraph();
  }, [centerGraph]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      setView((prev) => {
        const nextK = Math.min(2.6, Math.max(0.22, prev.k * factor));
        const wx = (mx - prev.x) / prev.k;
        const wy = (my - prev.y) / prev.k;
        return { k: nextK, x: mx - wx * nextK, y: my - wy * nextK };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    shouldCenterRef.current = true;
    setSelected("");
    setSelectedInst(null);
  }, [current?.id]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const apply = () => {
      if (!shouldCenterRef.current) return;
      if (el.clientWidth < 8 || el.clientHeight < 8) return;
      centerGraph();
      shouldCenterRef.current = false;
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, [centerGraph, data, showInst]);

  if (!data) return null;

  const selectedNode = nodes.find((n) => n.type_id === selected);
  const hoveredNode = nodes.find((n) => n.type_id === hovered);
  const focusInstId = selectedInst || hoveredInst;
  const inspectorInstParent = focusInstId
    ? nodes.find((n) => n.titles.some((item) => item.id === focusInstId))
    : null;
  const inspectorInst = focusInstId
    ? inspectorInstParent?.titles.find((item) => item.id === focusInstId) || null
    : null;
  const inspectorNode = inspectorInstParent || selectedNode || hoveredNode;
  const summary = data.summary;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    window.getSelection()?.removeAllRanges();
    if ((event.target as Element).closest("[data-node]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { px: event.clientX, py: event.clientY, vx: view.x, vy: view.y, moved: false };
    setPanning(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.px;
    const dy = event.clientY - dragRef.current.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragRef.current.moved = true;
    setView({ k: view.k, x: dragRef.current.vx + dx, y: dragRef.current.vy + dy });
  };

  const onPointerUp = () => {
    if (dragRef.current && !dragRef.current.moved) {
      setSelected("");
      setSelectedInst(null);
      setHovered("");
      setHoveredInst(null);
    }
    dragRef.current = null;
    setPanning(false);
  };

  /**
   * 点选对象：只保留该对象与其它对象、与模型的关系。
   * @param {string} typeId
   */
  const selectObject = (typeId: string) => {
    if (selectedInst) {
      setSelectedInst(null);
      setHoveredInst(null);
      setSelected(typeId);
    } else {
      setHoveredInst(null);
      setSelected((prev) => (prev === typeId ? "" : typeId));
    }
    setTypeMode((prev) => {
      if (prev.ref !== "off" || prev.impact !== "off" || prev.model_impact !== "off") return prev;
      return { ref: "focus", impact: "focus", model_impact: "focus" };
    });
  };

  /**
   * 点选实例：只展示该实例的实例关系。
   * @param {number} id
   * @param {string} typeId
   */
  const selectInstance = (id: number, typeId: string) => {
    setShowInst(true);
    setSelectedInst((prev) => (prev === id ? null : id));
    setSelected(typeId);
    setHoveredInst(id);
    if (instMode === "off") setInstMode("focus");
  };

  /**
   * 开关对象卡片内的实例标签。
   */
  const toggleInstTags = () => {
    setShowInst((prev) => {
      if (prev) {
        setSelectedInst(null);
        setHoveredInst(null);
      }
      return !prev;
    });
    shouldCenterRef.current = true;
  };

  /**
   * 清除对象 / 实例选中。
   */
  const clearFocus = () => {
    setSelected("");
    setSelectedInst(null);
    setHovered("");
    setHoveredInst(null);
  };

  return (
    <div className="pkm-pano-wrap">
      <div className="pkm-page-kicker">知识图谱</div>
      <h1 className="pkm-page-title">{data.product?.name || "产品"} · 对象与实例</h1>
      <p className="pkm-page-desc">
        展示对象、实例与引用关系，供校验知识是否可被推理。功能级上下游请看「功能与关系」。
      </p>

      <div className="pkm-pano-toolbar">
        <div className="pkm-pano-layers">
          {TYPE_LAYERS.map((layer) => (
            <button
              key={layer.key}
              type="button"
              title="点击切换：关闭 / 经过对象 / 全部"
              className={`pkm-pano-layer ${typeMode[layer.key]}${selectedInst ? " suppressed" : ""}`}
              style={{ "--layer": layer.color } as any}
              onClick={() => {
                setSelectedInst(null);
                setTypeMode((prev) => ({ ...prev, [layer.key]: nextMode(prev[layer.key]) }));
              }}
            >
              <i />
              {layer.label}
              <em>{MODE_HINT[typeMode[layer.key]]}</em>
              <b>{layer.key === "ref" ? summary.edge_ref : layer.key === "impact" ? summary.edge_impact : summary.edge_model}</b>
            </button>
          ))}
          <button
            type="button"
            title="点击切换：关闭 / 经过对象或实例 / 全部"
            className={`pkm-pano-layer ${instMode}${selected && !selectedInst ? " suppressed" : ""}${showInst ? "" : " suppressed"}`}
            style={{ "--layer": "#10a37f" } as any}
            onClick={() => {
              setSelected("");
              setSelectedInst(null);
              setInstMode((prev) => {
                const next = nextMode(prev);
                if (next !== "off") setShowInst(true);
                return next;
              });
            }}
          >
            <i />
            实例关系
            <em>{MODE_HINT[instMode]}</em>
            <b>{graphEdges.length}</b>
          </button>
          <button
            type="button"
            title="点击切换：关闭 / 经过对象或实例 / 全部"
            className={`pkm-pano-layer ${featMode}${selected || selectedInst ? " suppressed" : ""}`}
            style={{ "--layer": "#7c6aed" } as any}
            onClick={() => {
              setSelected("");
              setSelectedInst(null);
              setFeatMode((prev) => nextMode(prev));
            }}
          >
            <i />
            功能关系
            <em>{MODE_HINT[featMode]}</em>
            <b>{featEdges.length}</b>
          </button>
          <span className="pkm-pano-split" aria-hidden="true" />
          <button
            type="button"
            title="在对象卡片内显示或隐藏实例标签"
            className={`pkm-pano-layer ${showInst ? "all" : ""}`}
            style={{ "--layer": "#10a37f" } as any}
            onClick={toggleInstTags}
          >
            <i />
            显示实例
            <em>{showInst ? "开" : "关"}</em>
            <b>{summary.instance_total || 0}</b>
          </button>
          <button type="button" className="pkm-pano-layer" title="按左栏窗口居中并适配图谱" onClick={fitView}>
            <AimOutlined />
            适应画布
          </button>
          <button
            type="button"
            className={`pkm-pano-layer${selected || selectedInst ? "" : " suppressed"}`}
            title="取消当前选中的对象或实例"
            onClick={clearFocus}
          >
            <CloseOutlined />
            清除选中
          </button>
        </div>
      </div>
      {showInst && instMode !== "off" && instKinds.length ? (
        <div className="pkm-pano-sublayers">
          <span>实例关系含义</span>
          {instKinds.map((kind) => {
            const meta = instRelMeta(kind);
            return (
              <button
                key={kind}
                type="button"
                className={`pkm-pano-sub${instKindOn[kind] === false ? "" : " on"}`}
                style={{ "--layer": meta.color } as any}
                onClick={() => setInstKindOn((prev) => ({ ...prev, [kind]: prev[kind] === false }))}
              >
                <i />
                {meta.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {featMode !== "off" && featKinds.length ? (
        <div className="pkm-pano-sublayers">
          <span>功能关系含义</span>
          {featKinds.map((kind) => {
            const meta = FEAT_REL_META[kind] || { label: kind, color: "#6e6e80" };
            return (
              <button
                key={kind}
                type="button"
                className={`pkm-pano-sub${featKindOn[kind] === false ? "" : " on"}`}
                style={{ "--layer": meta.color } as any}
                onClick={() => setFeatKindOn((prev) => ({ ...prev, [kind]: prev[kind] === false }))}
              >
                <i />
                {meta.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="pkm-pano-stage">
        <div
          ref={canvasRef}
          className={`pkm-pano-canvas${panning ? " is-panning" : ""}`}
          onMouseLeave={() => {
            setHovered("");
            setHoveredInst(null);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="pkm-pano-world"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            }}
          >
            <svg width={layout.width} height={layout.height}>
              <rect x={0} y={0} width={layout.width} height={layout.height} fill={colors.canvas} />
              {(data.models || []).map((model: any, idx: number) => {
                const lit = litModels.has(model.code);
                const tone = MODEL_COLOR[idx];
                const x = PAD_X + idx * COL_W;
                return (
                  <g key={model.code}>
                    <rect
                      x={x - 4}
                      y={PAD_Y}
                      width={CARD_W + 8}
                      height={layout.height - PAD_Y * 2}
                      rx={14}
                      fill={tone}
                      opacity={lit ? (mode === "dark" ? 0.22 : 0.14) : mode === "dark" ? 0.1 : 0.07}
                    />
                    <rect x={x} y={PAD_Y} width={CARD_W} height={MODEL_HEAD_H} rx={10} fill={tone} />
                    <text x={x + 12} y={PAD_Y + 22} fontSize="12" fontWeight="700" fill="#ffffff">
                      {String(model.code).padStart(2, "0")} {model.name.replace("模型", "")}
                    </text>
                    <text x={x + 12} y={PAD_Y + 40} fontSize="10" fill="rgba(255,255,255,0.84)">
                      {model.type_ready}/{model.type_total} 已治理
                    </text>
                  </g>
                );
              })}

              {nodes.map((node) => {
                const box = layout.typeBox.get(node.type_id);
                if (!box) return null;
                const meta = statusMeta[node.status] || statusMeta.ungoverned;
                const active = relatedTypes.has(node.type_id) && (Boolean(focusType) || Boolean(focusInst) || selectedInst);
                const dim = Boolean((selected || selectedInst) && !relatedTypes.has(node.type_id));
                const extra = layout.extraByType.get(node.type_id) || 0;
                const modelColor = MODEL_COLOR[(node.model_code - 1) % 10];
                const showTagRule = (node.titles || []).some((item) => layout.instTags.has(item.id));
                return (
                  <g
                    key={node.type_id}
                    data-node="type"
                    opacity={dim ? 0.22 : 1}
                    onClick={() => selectObject(node.type_id)}
                    onMouseEnter={() => {
                      setHovered(node.type_id);
                      if (!selectedInst) setHoveredInst(null);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.w}
                      height={box.h}
                      rx={12}
                      fill={meta.fill}
                      stroke={node.type_id === selected && !selectedInst ? colors.accent : active ? meta.color : colors.border}
                      strokeWidth={node.type_id === selected && !selectedInst ? 2.2 : active ? 1.5 : 1}
                    />
                    <circle cx={box.x + DOT_X} cy={box.y + DOT_Y} r={4} fill={meta.color} />
                    <text x={box.x + 24} y={box.y + 18} fontSize="10" fill={colors.muted}>
                      {node.type_id}
                    </text>
                    <text x={box.x + 10} y={box.y + 34} fontSize="12" fontWeight="600" fill={colors.text}>
                      {fitLabel(node.name, CARD_W - 20, 12)}
                    </text>
                    <text x={box.x + 10} y={box.y + 48} fontSize="10" fill={colors.muted}>
                      {meta.label}
                      {node.instance_count ? ` · ${node.instance_count}` : ""}
                      {extra ? ` +${extra}` : ""}
                    </text>
                    {showTagRule ? (
                      <line
                        x1={box.x + 10}
                        y1={box.y + CARD_INFO_H}
                        x2={box.x + box.w - 10}
                        y2={box.y + CARD_INFO_H}
                        stroke={hexRgba(modelColor, 0.28)}
                        strokeWidth={1}
                      />
                    ) : null}
                  </g>
                );
              })}

              {visibleTypeEdges.map((edge, index) => {
                const sourceBox = layout.typeBox.get(edge.source);
                if (!sourceBox) return null;
                const start = objectDot(sourceBox);
                let end = start;
                if (edge.target.startsWith("M")) {
                  end = { x: PAD_X + (Number(edge.target.slice(1)) - 1) * COL_W + DOT_X, y: PAD_Y + DOT_Y };
                } else {
                  const targetBox = layout.typeBox.get(edge.target);
                  if (!targetBox) return null;
                  end = objectDot(targetBox);
                }
                const color = TYPE_LAYERS.find((item) => item.key === edge.kind)?.color || "#94a3b8";
                const thick = edge.kind === "model_impact" ? 2.6 : 2.1;
                const d = curvePath(start.x, start.y, end.x, end.y, edge.kind === "model_impact" ? 0.4 : 0.14);
                return (
                  <g key={`t-${edge.source}-${edge.target}-${edge.kind}-${index}`} style={{ pointerEvents: "none" }}>
                    <path d={d} fill="none" stroke={colors.halo} strokeWidth={thick + 3} strokeLinecap="round" />
                    <path
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={thick}
                      strokeLinecap="round"
                      strokeDasharray={edge.kind === "ref" ? undefined : edge.kind === "impact" ? "8 5" : "3 4"}
                    />
                  </g>
                );
              })}

              {nodes.map((node) => {
                const box = layout.typeBox.get(node.type_id);
                if (!box) return null;
                const meta = statusMeta[node.status] || statusMeta.ungoverned;
                const dim = Boolean((selected || selectedInst) && !relatedTypes.has(node.type_id));
                return (
                  <circle
                    key={`dot-${node.type_id}`}
                    cx={box.x + DOT_X}
                    cy={box.y + DOT_Y}
                    r={4.5}
                    fill={meta.color}
                    opacity={dim ? 0.22 : 1}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}

              {visibleFeatEdges.map((edge, index) => {
                const s = layout.instAnchor.get(edge.source) || layout.typeBox.get(instById.get(edge.source)?.type_id || "");
                const t = layout.instAnchor.get(edge.target) || layout.typeBox.get(instById.get(edge.target)?.type_id || "");
                if (!s || !t) return null;
                const color = (FEAT_REL_META[edge.kind] || { color: "#7c6aed" }).color;
                const d = curvePath(boxCenter(s).x, boxCenter(s).y, boxCenter(t).x, boxCenter(t).y, 0.18);
                return (
                  <g key={`f-${edge.source}-${edge.target}-${index}`} style={{ pointerEvents: "none" }} opacity={0.95}>
                    <path d={d} fill="none" stroke={colors.halo} strokeWidth="4" strokeLinecap="round" />
                    <path d={d} fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeDasharray="6 4" />
                  </g>
                );
              })}

              {visibleInstEdges.map((edge, index) => {
                const s = layout.instAnchor.get(edge.source);
                const t = layout.instAnchor.get(edge.target);
                if (!s || !t) return null;
                const color = instRelMeta(edge.relation || "引用").color;
                const d = curvePath(boxCenter(s).x, boxCenter(s).y, boxCenter(t).x, boxCenter(t).y, 0.2);
                return (
                  <g key={`i-${edge.source}-${edge.target}-${index}`} style={{ pointerEvents: "none" }} opacity={0.96}>
                    <path d={d} fill="none" stroke={colors.halo} strokeWidth="4" strokeLinecap="round" />
                    <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
                  </g>
                );
              })}

              {nodes.map((node) => {
                const dim = Boolean((selected || selectedInst) && !relatedTypes.has(node.type_id));
                return (node.titles || []).map((item) => {
                  const tag = layout.instTags.get(item.id);
                  if (!tag) return null;
                  const on = relatedInstIds.has(item.id);
                  return (
                    <g
                      key={item.id}
                      data-node="inst"
                      opacity={dim ? 0.22 : 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectInstance(item.id, node.type_id);
                      }}
                      onMouseEnter={(event) => {
                        event.stopPropagation();
                        setHovered(node.type_id);
                        setHoveredInst(item.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <rect
                        x={tag.x}
                        y={tag.y}
                        width={tag.w}
                        height={tag.h}
                        rx={8}
                        fill={on ? palette.selected : colors.card}
                        stroke={on ? colors.accent : MODEL_COLOR[(node.model_code - 1) % 10]}
                      />
                      {tag.lines.map((line, lineIndex) => (
                        <text key={lineIndex} x={tag.x + TAG_PAD_X} y={tag.y + 11 + lineIndex * 11} fontSize={TAG_FONT} fill={colors.text}>
                          {line}
                        </text>
                      ))}
                    </g>
                  );
                });
              })}
            </svg>
          </div>
          <div className="pkm-pano-zoom" data-node="zoom">
            <button type="button" onClick={() => zoomTo(view.k * 1.18)} aria-label="放大">
              <PlusOutlined />
            </button>
            <button type="button" onClick={() => zoomTo(view.k / 1.18)} aria-label="缩小">
              <MinusOutlined />
            </button>
            <button type="button" onClick={fitView} aria-label="适应画布">
              <AimOutlined />
            </button>
          </div>
        </div>

        <aside className="pkm-pano-inspector">
          {inspectorInst ? (
            <>
              <div className="pkm-pano-inspector-head">
                <span>{selectedInst ? "已选实例 · 只显示实例关系" : "悬停实例"}</span>
                <strong>{inspectorInst.name}</strong>
                <SpaceLike>
                  <Tag>{inspectorNode?.type_id}</Tag>
                  <Tag>{inspectorNode?.name}</Tag>
                </SpaceLike>
              </div>
              <h4>该实例的关系</h4>
              <div className="pkm-pano-rel">
                {graphEdges.filter((edge) => edge.source === inspectorInst.id || edge.target === inspectorInst.id).length ? (
                  graphEdges
                    .filter((edge) => edge.source === inspectorInst.id || edge.target === inspectorInst.id)
                    .map((edge, index) => {
                      const otherId = edge.source === inspectorInst.id ? edge.target : edge.source;
                      const other = instById.get(otherId);
                      const meta = instRelMeta(edge.relation || "引用");
                      return (
                        <button
                          key={`${edge.source}-${edge.target}-${index}`}
                          type="button"
                          className="pkm-pano-rel-item"
                          onClick={() => other && selectInstance(otherId, other.type_id)}
                        >
                          <Tag color={meta.color}>{meta.label}</Tag>
                          <span>
                            {edge.source === inspectorInst.id ? "指向" : "来自"} {other?.name || otherId}
                          </span>
                        </button>
                      );
                    })
                ) : (
                  <Typography.Text type="secondary">这条实例还没有引用关系。</Typography.Text>
                )}
              </div>
              <div className="pkm-pano-actions">
                <Button size="small" type="primary" onClick={() => openEntity({ mode: "view", id: inspectorInst.id, typeId: inspectorNode?.type_id })}>
                  打开实例
                </Button>
              </div>
            </>
          ) : inspectorNode ? (
            <>
              <div className="pkm-pano-inspector-head">
                <span>{selected ? "已选对象 · 对象与模型关系" : "悬停预览"}</span>
                <strong>
                  {inspectorNode.type_id} {inspectorNode.name}
                </strong>
                <SpaceLike>
                  <GovernanceTag stage={inspectorNode.status} completeness={inspectorNode.completeness} />
                  <Tag>{inspectorNode.knowledge_kind}</Tag>
                </SpaceLike>
              </div>
              <div className="pkm-pano-mini">
                <div>
                  <b>{inspectorNode.completeness || 0}%</b>
                  <span>完整度</span>
                </div>
                <div>
                  <b>{inspectorNode.instance_count}</b>
                  <span>实例</span>
                </div>
                <div>
                  <b>{inspectorNode.source_count || 0}</b>
                  <span>来源</span>
                </div>
                <div>
                  <b>{inspectorNode.related_count || 0}</b>
                  <span>结构关联</span>
                </div>
              </div>
              <p className="pkm-pano-q">核心问句：{inspectorNode.core_question}</p>
              <Progress percent={inspectorNode.completeness || 0} size="small" strokeColor={colors.accent} />
              <h4>图上关联的对象</h4>
              <div className="pkm-pano-rel">
                {edges.filter((e) => e.source === inspectorNode.type_id || e.target === inspectorNode.type_id).length ? (
                  edges
                    .filter((e) => e.source === inspectorNode.type_id || e.target === inspectorNode.type_id)
                    .map((edge) => {
                      const other = edge.source === inspectorNode.type_id ? edge.target : edge.source;
                      const otherNode = nodes.find((n) => n.type_id === other);
                      const label = otherNode ? `${other} ${otherNode.name}` : other.replace("M", "模型 ");
                      return (
                        <button
                          key={`${edge.source}-${edge.target}-${edge.kind}`}
                          type="button"
                          className="pkm-pano-rel-item"
                          onClick={() => otherNode && setSelected(otherNode.type_id)}
                        >
                          <Tag color={edge.kind === "ref" ? "blue" : edge.kind === "impact" ? "orange" : "red"}>{edge.label}</Tag>
                          <span>
                            {edge.source === inspectorNode.type_id ? "指向" : "来自"} {label}
                          </span>
                        </button>
                      );
                    })
                ) : (
                  <Typography.Text type="secondary">清单未配置强制引用。</Typography.Text>
                )}
              </div>
              <h4>实例标签</h4>
              <div className="pkm-pano-rel">
                {inspectorNode.titles.length ? (
                  inspectorNode.titles.map((item) => (
                    <button key={item.id} type="button" className="pkm-pano-rel-item" onClick={() => selectInstance(item.id, inspectorNode.type_id)}>
                      <span>{item.name}</span>
                    </button>
                  ))
                ) : (
                  <Typography.Text type="secondary">还没有实例。</Typography.Text>
                )}
              </div>
              <div className="pkm-pano-actions">
                <CapAction allowed={writable && hasCap(user, "entity_create")} hint={writable ? CAP_HINTS.entity_create : CAP_HINTS.product_write}>
                  <Button size="small" onClick={() => openEntity({ mode: "create", typeId: inspectorNode.type_id })}>
                    新建
                  </Button>
                </CapAction>
                <Button size="small" type="primary" onClick={() => navigate(`${base}/knowledge/${inspectorNode.model_code}`)}>
                  打开模型
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="pkm-pano-inspector-head">
                <span>知识图谱</span>
                <strong>图层与颜色</strong>
              </div>
              <p className="pkm-pano-q">每个图层三次点击：关闭、经过对象时显示、显示全部。点实例后只保留该实例的关系线。实例关系按功能定义配色，可单独关掉某一种。</p>
              <h4>实例关系颜色</h4>
              <div className="pkm-pano-legend">
                {Object.entries(INST_REL_META).map(([key, meta]) => (
                  <span key={key}>
                    <i style={{ background: meta.color }} />
                    {meta.label}
                  </span>
                ))}
              </div>
              <h4>功能关系颜色</h4>
              <div className="pkm-pano-legend">
                {Object.entries(FEAT_REL_META).map(([key, meta]) => (
                  <span key={key}>
                    <i style={{ background: meta.color }} />
                    {meta.label}
                  </span>
                ))}
              </div>
              <h4>对象状态</h4>
              <div className="pkm-pano-legend">
                {Object.entries(statusMeta).map(([key, meta]) => (
                  <span key={key}>
                    <i style={{ background: meta.color }} />
                    {meta.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * 简易间距容器。
 */
function SpaceLike({ children }: { children: ReactNode }) {
  return <div className="pkm-pano-tags">{children}</div>;
}
