import { Result } from "antd";
import { useEffect } from "react";
import { api } from "../api";
import { hasAccess, useAuth } from "../auth";

/**
 * 已登录但未被开通时的缺省页。管理员开通后自动进入系统。
 */
export default function NoAccessPage() {
  const { user } = useAuth();

  useEffect(() => {
    const timer = window.setInterval(() => {
      api
        .get("/api/auth/me")
        .then((res) => {
          if (hasAccess(res.data)) {
            window.location.reload();
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="pkm-login">
      <div className="pkm-login-mark">知</div>
      <h1>产品知识模型</h1>
      <Result
        status="403"
        title="无访问权限"
        subTitle={`${user?.display_name || user?.username || "当前账号"} 尚未开通本系统，请联系管理员添加后再使用。`}
      />
    </div>
  );
}
