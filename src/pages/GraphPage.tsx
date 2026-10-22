import { Card, Select, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { graphColors, useTheme } from "../theme";
import { useProduct } from "../product";
import { useWorkspace } from "../workspace";

const COLORS = ["#1677ff", "#13c2c2", "#52c41a", "#fa8c16", "#722ed1", "#eb2f96", "#2f54eb", "#fa541c", "#a0d911", "#8c8c8c"];

interface GraphNode {
  id: number;
  name: string;
  type_id: string;
  type_name: string;
  model_code: number;
  model_name: string;
  knowledge_kind: string;
}

interface GraphEdge {
  source: number;
  target: number;
  relation: string;
}

/**
 * 当前产品已录入实例之间的真实引用。
 */
export default function GraphPage() {
  const [model, setModel] = useState<number | undefined>(undefined);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const { openEntity } = useWorkspace();
  const { current } = useProduct();
  const { mode, palette } = useTheme();
  const colors = graphColors(palette, mode);

  useEffect(() => {
    api.get("/api/graph", { params: model ? { model_code: model } : {} }).then((res) => {
      setNodes(res.data?.nodes || []);
      setEdges(res.data?.edges || []);
    }).catch(() => {
      setNodes([]);
      setEdges([]);
    });
  }, [model, current?.id]);

  const layout = useMemo(() => {
    const groups = new Map<number, GraphNode[]>();
    nodes.forEach((n) => {
      const list = groups.get(n.model_code) || [];
      list.push(n);
      groups.set(n.model_code, list);
    });
    const positioned: Array<GraphNode & { x: number; y: number }> = [];
    const codes = [...groups.keys()].sort((a, b) => a - b);
    codes.forEach((code, col) => {
      (groups.get(code) || []).forEach((node, row) => {
        positioned.push({ ...node, x: 90 + col * 170, y: 70 + row * 70 });
      });
    });
    return positioned;
  }, [nodes]);

  const posMap = useMemo(() => new Map(layout.map((n) => [n.id, n])), [layout]);
  const width = Math.max(1200, (new Set(nodes.map((n) => n.model_code)).size + 1) * 170);
  const colCounts = Array.from(new Set(nodes.map((n) => n.model_code))).map(
    (c) => nodes.filter((n) => n.model_code === c).length,
  );
  const height = Math.max(640, (colCounts.length ? Math.max(...colCounts) : 1) * 70 + 120);

  return (
    <div>
      <div className="pkm-page-head">
        <div>
          <div className="pkm-page-kicker">Graph</div>
          <h1 className="pkm-page-title">实例图谱</h1>
          <p className="pkm-page-desc">展示当前产品已录入实例之间的真实引用。78 类对象请看「对象结构图」，产品之间请看「知识全景」。</p>
        </div>
        <Select
          allowClear
          placeholder="全部模型"
          style={{ width: 200 }}
          onChange={(v) => setModel(v)}
          options={Array.from({ length: 10 }).map((_, i) => ({ value: i + 1, label: `模型 ${i + 1}` }))}
        />
      </div>
      <Card>
      <div style={{ marginBottom: 12 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <Tag key={i} color={COLORS[i]}>
            {i + 1}
          </Tag>
        ))}
      </div>
      <div className="graph-canvas">
        <svg width={width} height={height}>
          <rect x={0} y={0} width={width} height={height} fill={colors.canvas} />
          {edges.map((e, idx) => {
            const s = posMap.get(e.source);
            const t = posMap.get(e.target);
            if (!s || !t) return null;
            return (
              <line
                key={idx}
                x1={s.x + 60}
                y1={s.y + 16}
                x2={t.x + 60}
                y2={t.y + 16}
                stroke={colors.edge}
                strokeWidth="1"
                markerEnd="url(#arrow)"
              />
            );
          })}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={colors.edge} />
            </marker>
          </defs>
          {layout.map((n) => (
            <g key={n.id} onClick={() => openEntity({ mode: "view", id: n.id, typeId: n.type_id })} style={{ cursor: "pointer" }}>
              <rect x={n.x} y={n.y} rx={6} width={130} height={44} fill={COLORS[(n.model_code - 1) % 10]} opacity={0.12} stroke={COLORS[(n.model_code - 1) % 10]} />
              <text x={n.x + 10} y={n.y + 18} fontSize="11" fill={colors.muted}>
                {n.type_id}
              </text>
              <text x={n.x + 10} y={n.y + 34} fontSize="12" fill={colors.text}>
                {n.name.slice(0, 10)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
    </div>
  );
}
