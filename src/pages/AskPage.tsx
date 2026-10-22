import { Navigate, useSearchParams } from "react-router-dom";

/**
 * 知识问答已并入首页，旧 /ask 入口带查询参数跳转过去。
 */
export default function AskPage() {
  const [params] = useSearchParams();
  const search = params.toString();
  return <Navigate to={search ? `/?${search}` : "/"} replace />;
}
