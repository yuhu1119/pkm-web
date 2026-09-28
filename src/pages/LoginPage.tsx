import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Spin, Tooltip } from "antd";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useTheme } from "../theme";

/**
 * SSO 等待页：无账号密码。未登录时由网关/平台完成 SSO，本页只说明状态。
 */
export default function LoginPage() {
  const { mode, toggle } = useTheme();
  const navigate = useNavigate();
  const logoutUrl = import.meta.env.VITE_SSO_LOGOUT;

  useEffect(() => {
    const timer = window.setInterval(() => {
      api
        .get("/api/auth/me")
        .then(() => navigate("/", { replace: true }))
        .catch(() => undefined);
    }, 2000);
    api
      .get("/api/auth/me")
      .then(() => navigate("/", { replace: true }))
      .catch(() => undefined);
    return () => window.clearInterval(timer);
  }, [navigate]);

  return (
    <div className="pkm-login">
      <div className="pkm-login-theme">
        <Tooltip title={mode === "dark" ? "切换到浅色" : "切换到深色"}>
          <button type="button" className="pkm-icon-btn" onClick={toggle} aria-label="切换外观">
            {mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
          </button>
        </Tooltip>
      </div>
      <div className="pkm-login-mark">知</div>
      <h1>产品知识模型</h1>
      <p className="pkm-muted">请通过公司平台 SSO 进入。本系统不再提供本地账号密码登录。</p>
      <div className="pkm-login-card" style={{ textAlign: "center", padding: 32 }}>
        <Spin />
        <p className="pkm-muted" style={{ marginTop: 16, marginBottom: 0 }}>
          若长时间停在此页，请确认已登录 SpeedLoop 平台，且前端的 <code>VITE_API_BASE</code> 指向后端项目前缀。
        </p>
        {logoutUrl ? (
          <p className="pkm-muted" style={{ marginTop: 12 }}>
            <a href={logoutUrl}>前往平台退出</a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
