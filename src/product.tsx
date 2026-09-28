import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { parseWorkspaceProductId } from "./paths";

export interface ProductCard {
  id: number;
  name: string;
  code?: string;
  description: string;
  owner?: string;
  status?: string;
  entity_count?: number;
  feature_count?: number;
  governed_types?: number;
}

interface ProductState {
  products: ProductCard[];
  current: ProductCard | null;
  loading: boolean;
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

  const reload = async () => {
    const res = await api.get("/api/products");
    const rows: ProductCard[] = res.data || [];
    setProducts(rows);
    const fromUrl = parseWorkspaceProductId(window.location.pathname);
    const stored = fromUrl || Number(localStorage.getItem("pkm_product_id") || 0);
    const exists = rows.some((item) => item.id === stored);
    const next = exists ? stored : rows[0]?.id || 0;
    if (next && next !== Number(localStorage.getItem("pkm_product_id") || 0)) {
      localStorage.setItem("pkm_product_id", String(next));
    }
    setCurrentId(next);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, []);

  const value = useMemo<ProductState>(
    () => ({
      products,
      current: products.find((item) => item.id === currentId) || products[0] || null,
      loading,
      setCurrentId: (id: number) => {
        if (id === currentId) return;
        localStorage.setItem("pkm_product_id", String(id));
        setCurrentId(id);
        window.dispatchEvent(new Event("pkm-refresh"));
      },
      reload,
    }),
    [products, currentId, loading],
  );

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
