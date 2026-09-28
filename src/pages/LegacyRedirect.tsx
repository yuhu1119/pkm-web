import { Navigate, useLocation, useParams } from "react-router-dom";
import { resolveProductId, workspacePath } from "../paths";

/**
 * 旧版顶层知识路由迁到产品工作台。没有最近产品时回到产品管理。
 * @param {{ to: string }} props 工作台子路径，可用 $model 占位
 */
export default function LegacyRedirect({ to }: { to: string }) {
  const { modelCode } = useParams();
  const location = useLocation();
  const productId = Number(resolveProductId() || 0);
  if (!productId) {
    return <Navigate to="/products" replace />;
  }
  const sub = to.replace("$model", String(modelCode || "1"));
  return <Navigate to={`${workspacePath(productId, sub)}${location.search}`} replace />;
}
