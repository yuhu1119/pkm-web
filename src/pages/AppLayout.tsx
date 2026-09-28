import {
  ApartmentOutlined,
  AppstoreOutlined,
  ArrowLeftOutlined,
  MoonOutlined,
  SunOutlined,
  CloudSyncOutlined,
  ClusterOutlined,
  ApiOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  FundProjectionScreenOutlined,
  GlobalOutlined,
  HistoryOutlined,
  HomeOutlined,
  NodeIndexOutlined,
  PartitionOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SwapOutlined,
  ShareAltOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { PageContainer, ProLayout } from "@ant-design/pro-components";
import { Avatar, Dropdown, Tooltip } from "antd";
import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { KNOWLEDGE_MODELS, parseWorkspaceProductId, workspacePath } from "../paths";
import { useProduct } from "../product";
import { layoutToken, useTheme } from "../theme";
import { WorkspaceProvider } from "../workspace";
import PageErrorBoundary from "./PageErrorBoundary";

const MODEL_ICONS = [
  <FundProjectionScreenOutlined />,
  <ApartmentOutlined />,
  <DatabaseOutlined />,
  <NodeIndexOutlined />,
  <SwapOutlined />,
  <SafetyCertificateOutlined />,
  <ClusterOutlined />,
  <DeploymentUnitOutlined />,
  <TeamOutlined />,
  <HistoryOutlined />,
];

/**
 * 平台一级菜单：全部平铺，且每项都有图标。
 */
function platformRoutes() {
  return [
    { path: "/", name: "首页", icon: <HomeOutlined /> },
    { path: "/landscape", name: "知识全景", icon: <GlobalOutlined /> },
    { path: "/products", name: "产品管理", icon: <AppstoreOutlined /> },
    { path: "/apps", name: "知识应用", icon: <ApiOutlined /> },
    { path: "/skills", name: "技能配置", icon: <ThunderboltOutlined /> },
    { path: "/settings", name: "系统设置", icon: <SettingOutlined /> },
  ];
}

/**
 * @param {number} productId
 */
function workspaceRoutes(productId: number) {
  return [
    { path: "/products", name: "全部产品", icon: <ArrowLeftOutlined /> },
    { path: workspacePath(productId, "/overview"), name: "知识概览", icon: <FundProjectionScreenOutlined /> },
    { path: workspacePath(productId, "/sources"), name: "知识收集", icon: <CloudSyncOutlined /> },
    {
      path: workspacePath(productId, "/knowledge"),
      name: "知识治理",
      icon: <ApartmentOutlined />,
      routes: KNOWLEDGE_MODELS.map((item, index) => ({
        path: workspacePath(productId, `/knowledge/${item.code}`),
        name: item.name,
        icon: MODEL_ICONS[index],
      })),
    },
    { path: workspacePath(productId, "/relations"), name: "功能与关系", icon: <ShareAltOutlined /> },
    { path: workspacePath(productId, "/structure"), name: "知识图谱", icon: <PartitionOutlined /> },
    { path: workspacePath(productId, "/pack"), name: "模型投喂", icon: <ExperimentOutlined /> },
  ];
}

/**
 * 根据路由给出访问日志标题。
 * @param {string} pathname
 */
function visitTitle(pathname: string) {
  if (pathname === "/") return "首页";
  if (pathname.startsWith("/landscape") || pathname.startsWith("/panorama")) return "知识全景";
  if (pathname === "/products") return "产品管理";
  if (pathname === "/apps") return "知识应用";
  if (pathname === "/skills") return "技能配置";
  if (pathname === "/settings") return "系统设置";
  if (pathname === "/ask") return "知识问答";
  if (pathname.includes("/overview")) return "知识概览";
  if (pathname.includes("/sources")) return "知识收集";
  if (pathname.includes("/knowledge")) return "知识治理";
  if (pathname.includes("/relations")) return "功能与关系";
  if (pathname.includes("/structure") || pathname.includes("/graph")) return "知识图谱";
  if (pathname.includes("/pack")) return "模型投喂";
  if (pathname.includes("/search")) return "检索";
  return pathname;
}

/**
 * 平台主框架：顶栏品牌 + 平铺侧栏，内容区大留白。
 */
export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { current: currentProduct } = useProduct();
  const { mode, toggle, palette } = useTheme();
  const productId = parseWorkspaceProductId(location.pathname);
  const inWorkspace = !!productId;
  const fullBleed =
    location.pathname.includes("/structure") ||
    location.pathname.includes("/graph") ||
    location.pathname.startsWith("/landscape") ||
    location.pathname.startsWith("/panorama");
  const isHome = location.pathname === "/";
  const knowledgeMenu = productId ? workspacePath(productId, "/knowledge") : "";
  const openKeys = inWorkspace ? [knowledgeMenu].filter(Boolean) : [];
  const selectedKeys = location.pathname.includes("/graph") && productId
    ? [workspacePath(productId, "/structure")]
    : [location.pathname];

  useEffect(() => {
    if (!user) return;
    api.post("/api/audit/visit", { path: location.pathname, title: visitTitle(location.pathname) }).catch(() => undefined);
  }, [location.pathname, user]);

  return (
    <ProLayout
      className="pkm-layout"
      title="产品知识模型"
      layout="mix"
      splitMenus={false}
      logo={false}
      menuHeaderRender={false}
      collapsedButtonRender={false}
      siderWidth={232}
      fixSiderbar
      fixedHeader
      location={location}
      token={layoutToken(palette)}
      headerTitleRender={() => (
        <button type="button" className="pkm-nav-brand" onClick={() => navigate("/")}>
          <span className="pkm-nav-mark">知</span>
          <span className="pkm-nav-title">产品知识模型</span>
        </button>
      )}
      menuItemRender={(item, dom) => <Link to={item.path || "/"}>{dom}</Link>}
      menuProps={{
        openKeys,
        selectedKeys,
        onOpenChange: () => undefined,
      }}
      route={{
        path: "/",
        routes: inWorkspace && productId ? workspaceRoutes(productId) : platformRoutes(),
      }}
      actionsRender={() => [
        <Tooltip key="theme" title={mode === "dark" ? "切换到浅色" : "切换到深色"}>
          <button type="button" className="pkm-icon-btn" onClick={toggle} aria-label="切换外观">
            {mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
          </button>
        </Tooltip>,
      ]}
      avatarProps={{
        title: user?.display_name || user?.username,
        render: (_, _dom) => (
          <Dropdown
            menu={{
              items: [
                { key: "role", label: `角色：${user?.role}`, disabled: true },
                { key: "logout", label: "退出登录" },
              ],
              onClick: ({ key }) => key === "logout" && logout(),
            }}
          >
            <Avatar size={28} style={{ background: palette.primary, color: palette.bg, cursor: "pointer", fontSize: 12 }}>
              {(user?.display_name || user?.username || "?").slice(0, 1)}
            </Avatar>
          </Dropdown>
        ),
      }}
      onMenuHeaderClick={() => navigate("/")}
      ErrorBoundary={false}
    >
      <WorkspaceProvider>
        <PageContainer
          className={fullBleed ? "pkm-pano-page" : isHome ? "pkm-home-page" : undefined}
          breadcrumbRender={false}
          title={false}
        >
          <PageErrorBoundary resetKey={location.pathname + location.search + String(currentProduct?.id || "")}>
            <Outlet key={String(productId || "platform")} />
          </PageErrorBoundary>
        </PageContainer>
      </WorkspaceProvider>
    </ProLayout>
  );
}
