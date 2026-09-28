import { Spin } from "antd";
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { resolveProductId, workspacePath } from "../paths";

/**
 * 将旧的详情 / 编辑整页路由收敛到知识治理页，并用抽屉打开。
 */
export default function EntityRedirect({ mode = "view" }: { mode?: "view" | "edit" | "create" }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const boot = async () => {
      const productId = Number(resolveProductId() || 0);
      if (!productId) {
        navigate("/products", { replace: true });
        return;
      }
      if (mode === "create" || !id) {
        const type = new URLSearchParams(location.search).get("type") || "E01-001";
        const code = Number(type.slice(1, 3)) || 1;
        navigate(`${workspacePath(productId, `/knowledge/${code}`)}?create=1&type=${encodeURIComponent(type)}`, { replace: true });
        return;
      }
      const res = await api.get(`/api/entities/${id}`);
      const entity = res.data.entity;
      navigate(
        `${workspacePath(productId, `/knowledge/${entity.model_code}`)}?entity=${entity.id}&mode=${mode}&type=${encodeURIComponent(entity.type_id)}`,
        { replace: true },
      );
    };
    boot();
  }, [id, mode, location.search, navigate]);

  return (
    <div style={{ padding: 80, textAlign: "center" }}>
      <Spin />
    </div>
  );
}
