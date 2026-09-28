import { SearchOutlined } from "@ant-design/icons";
import { Input } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useProduct } from "../product";

/**
 * 平台首页：标题、检索与数据看板在内容区居中。
 */
export default function HomePage() {
  const { products, loading } = useProduct();
  const [landscape, setLandscape] = useState<any>(null);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/landscape").then((res) => setLandscape(res.data));
  }, []);

  const summary = landscape?.summary || {};
  const entityTotal = products.reduce((sum, item) => sum + (item.entity_count || 0), 0);
  const governedTotal = products.reduce((sum, item) => sum + (item.governed_types || 0), 0);

  /**
   * 提交知识检索，进入知识问答页。
   * @param {string} [value]
   */
  const goAsk = (value?: string) => {
    const q = (value ?? query).trim();
    if (!q) return;
    navigate(`/ask?q=${encodeURIComponent(q)}`);
  };

  if (loading) {
    return null;
  }

  return (
    <div className="pkm-home">
      <div className="pkm-home-hero">
        <div className="pkm-page-kicker">Product Knowledge Model</div>
        <h1>产品知识模型</h1>
        <p>公司多产品的底座知识与 AI 出口。先治理十大模型，再用问答验证，把已治理内容投喂给其它平台。</p>
        <div className="pkm-home-search">
          <Input
            size="large"
            allowClear
            value={query}
            prefix={<SearchOutlined />}
            placeholder="提问或检索知识"
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={() => goAsk()}
            aria-label="提问或检索知识"
          />
        </div>
      </div>

      <div className="pkm-home-board">
        <div className="pkm-section-title">数据看板</div>
        <div className="pkm-kpi-row">
          <div className="pkm-kpi">
            <b>{products.length}</b>
            <span>产品</span>
          </div>
          <div className="pkm-kpi">
            <b>{entityTotal}</b>
            <span>知识实例</span>
          </div>
          <div className="pkm-kpi">
            <b>{governedTotal}</b>
            <span>已治理对象类</span>
          </div>
          <div className="pkm-kpi">
            <b>{summary.product_edges || 0}</b>
            <span>产品关系</span>
          </div>
        </div>
      </div>
    </div>
  );
}
