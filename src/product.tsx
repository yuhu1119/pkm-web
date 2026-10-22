import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, apiErrorDetail, asList } from "./api";
import { currentAppPathname, parseWorkspaceProductId } from "./paths";

export interface ProductCard {
  id: number;
  name: string;
  code?: string;
  description: string;
  owner?: string;
  status?: string;
  created_by?: string;
  entity_count?: number;
  feature_count?: number;
  governed_types?: number;
  can_read?: boolean;
  can_write?: boolean;
  online?: boolean;
}

interface ProductState {
  products: ProductCard[];
  current: ProductCard | null;
  loading: boolean;
  error: string;
  setCurrentId: (id: number) => void;
  reload: () => Promise<void>;
}

const ProductContext = createContext<ProductState | null>(null);

/**
 * 当前工作产品：请求头 X-Product-Id，知识按产品隔离。
 */
export function ProductProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [currentId, setCurrentId] = useState<number>(() => Number(localStorage.getItem("pkm_product_id") || 0));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/products");
      const rows = asList<ProductCard>(res.data);
      setProducts(rows);
      setError("");
      const fromUrl = parseWorkspaceProductId(currentAppPathname());
      const stored = fromUrl || Number(localStorage.getItem("pkm_product_id") || 0);
      const exists = rows.some((item) => item.id === stored);
      const next = exists ? stored : rows[0]?.id || 0;
      if (next && next !== Number(localStorage.getItem("pkm_product_id") || 0)) {
        localStorage.setItem("pkm_product_id", String(next));
      }
      setCurrentId(next);
    } catch (err) {
      setProducts([]);
      setError(apiErrorDetail(err, "产品列表加载失败"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  const value = useMemo<ProductState>(() => {
    const list = Array.isArray(products) ? products : [];
    return {
      products: list,
      current: list.find((item) => item.id === currentId) || list[0] || null,
      loading,
      error,
      setCurrentId: (id: number) => {
        if (id === currentId) return;
        localStorage.setItem("pkm_product_id", String(id));
        setCurrentId(id);
        window.dispatchEvent(new Event("pkm-refresh"));
      },
      reload,
    };
  }, [products, currentId, loading, error]);

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

/**
 * 读取当前产品上下文。
 */
export function useProduct() {
  const ctx = useContext(ProductContext);
  if (!ctx) {
    throw new Error("ProductProvider missing");
  }
  return ctx;
}
