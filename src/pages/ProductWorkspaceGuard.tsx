import { Spin } from "antd";
import { useEffect } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useProduct } from "../product";

/**
 * 进入某个产品的知识工作台：校验产品存在，并把当前产品与 URL 对齐。
 */
export default function ProductWorkspaceGuard() {
  const { productId } = useParams();
  const { products, loading, setCurrentId } = useProduct();
  const id = Number(productId);

  useEffect(() => {
    if (id) setCurrentId(id);
  }, [id, setCurrentId]);

  if (loading) {
    return (
      <div style={{ padding: 80, textAlign: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!id || !products.some((item) => item.id === id)) {
    return <Navigate to="/products" replace />;
  }
  return <Outlet />;
}
