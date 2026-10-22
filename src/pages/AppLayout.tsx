import {
  ApartmentOutlined,
  AppstoreOutlined,
  ArrowLeftOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
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
import { Avatar, Breadcrumb, Dropdown, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { isAdmin, useAuth } from "../auth";
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
 * 平台一级菜单：技能配置对每位登录用户开放；系统设置仅管理员可见。
 * @param {boolean} admin
 */
function platformRoutes(admin: boolean) {
  const routes = [
    { path: "/", name: "首页", icon: <HomeOutlined /> },
    { path: "/products", name: "产品", icon: <AppstoreOutlined /> },
    { path: "/landscape", name: "知识全景", icon: <GlobalOutlined /> },
    { path: "/apps", name: "知识应用", icon: <ApiOutlined /> },
    { path: "/skills", name: "技能配置", icon: <ThunderboltOutlined /> },
  ];
  if (admin) {
    routes.push({ path: "/settings", name: "系统设置", icon: <SettingOutlined /> });
  }
  return routes;
}

/**
 * @param {number} productId
 */
function workspaceRoutes(productId: number) {
  return [
    { path: "/products", name: "全部产品", icon: <ArrowLeftOutlined /> },
    { path: workspacePath(productId, "/overview"), name: "概览", icon: <FundProjectionScreenOutlined /> },
    { path: workspacePath(productId, "/sources"), name: "收集", icon: <CloudSyncOutlined /> },
    {
      path: workspacePath(productId, "/knowledge"),
      name: "治理",
      icon: <ApartmentOutlined />,
      routes: KNOWLEDGE_MODELS.map((item, index) => ({
        path: workspacePath(productId, `/knowledge/${item.code}`),
        name: item.name,
        icon: MODEL_ICONS[index],
      })),
    },
    { path: workspacePath(productId, "/structure"), name: "图谱", icon: <PartitionOutlined /> },
    { path: workspacePath(productId, "/relations"), name: "功能与关系", icon: <ShareAltOutlined /> },
    { path: workspacePath(productId, "/pack"), name: "投喂预览", icon: <ExperimentOutlined /> },
  ];
}

/**
 * 根据路由给出访问日志标题。
 * @param {string} pathname
 */
function visitTitle(pathname: string) {
  if (pathname === "/" || pathname === "/ask") return "首页";
  if (pathname.startsWith("/landscape") || pathname.startsWith("/panorama")) return "知识全景";
  if (pathname === "/products") return "产品";
  if (pathname === "/apps") return "知识应用";
  if (pathname === "/skills") return "技能配置";
  if (pathname === "/settings") return "系统设置";
  if (pathname.includes("/overview")) return "概览";
  if (pathname.includes("/sources")) return "收集";
  if (pathname.includes("/knowledge")) return "治理";
  if (pathname.includes("/relations")) return "功能与关系";
  if (pathname.includes("/structure") || pathname.includes("/graph")) return "图谱";
  if (pathname.includes("/pack")) return "投喂预览";
  if (pathname.includes("/search")) return "检索";
  return pathname;
}

/**
 * 按当前路由生成面包屑。工作台带产品名，知识治理带模型名。
 * @param {string} pathname
 * @param {string} [productName]
 */
function pageCrumbs(pathname: string, productName?: string) {
  const item = (title: string, path?: string) => ({
    title: path ? <Link to={path}>{title}</Link> : title,
  });
  if (pathname === "/" || pathname === "/ask") return [item("首页")];
  if (pathname === "/landscape") return [item("知识全景")];
  if (pathname === "/apps") return [item("知识应用")];
  if (pathname === "/products") return [item("产品")];
  if (pathname === "/skills") return [item("技能配置")];
  if (pathname === "/settings") return [item("系统设置")];
  const productId = parseWorkspaceProductId(pathname);
  if (!productId) return [item(visitTitle(pathname))];
  const rest = pathname.slice(`/products/${productId}`.length) || "";
  const product = item(productName || "产品工作台", workspacePath(productId, "/overview"));
  const manage = item("产品", "/products");
  if (rest === "" || rest === "/" || rest === "/overview") return [manage, product, item("概览")];
  if (rest === "/sources") return [manage, product, item("收集")];
  if (rest === "/relations") return [manage, product, item("功能与关系")];
  if (rest === "/structure" || rest === "/graph") return [manage, product, item("图谱")];
  if (rest === "/pack") return [manage, product, item("投喂预览")];
  if (rest === "/search") return [manage, product, item("检索")];
  const knowledge = rest.match(/^\/knowledge\/(\d+)$/);
  if (knowledge) {
    const model = KNOWLEDGE_MODELS.find((row) => String(row.code) === knowledge[1]);
    return [manage, product, item("治理", workspacePath(productId, "/knowledge/1")), item(model?.name || "对象列表")];
  }
  if (rest.startsWith("/knowledge")) return [manage, product, item("治理")];
  return [manage, product];
}

/**
 * 平台主框架：顶栏品牌 + 侧栏，内容区面包屑与查询表格边距。
 */
export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { current: currentProduct } = useProduct();
  const { mode, toggle, palette } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const productId = parseWorkspaceProductId(location.pathname);
  const inWorkspace = !!productId;
  const isHome = location.pathname === "/" || location.pathname === "/ask";
  const fullBleed =
    location.pathname.includes("/structure") ||
    location.pathname.includes("/graph") ||
    location.pathname.startsWith("/landscape") ||
    location.pathname.startsWith("/panorama");
  const knowledgeMenu = productId ? workspacePath(productId, "/knowledge") : "";
  const openKeys = inWorkspace ? [knowledgeMenu].filter(Boolean) : [];
  const structurePath = productId ? workspacePath(productId, "/structure") : "";
  const selectedKeys =
    (location.pathname.includes("/graph") || location.pathname.includes("/structure")) && structurePath
      ? [structurePath]
      : [location.pathname === "/ask" ? "/" : location.pathname];

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
      collapsed={collapsed}
      onCollapse={setCollapsed}
      breakpoint={false}
      disableMobile
      collapsedButtonRender={false}
      menuFooterRender={() => (
        <button
          type="button"
          className="pkm-sider-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "展开菜单" : "收起菜单"}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>
      )}
      siderWidth={220}
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
      subMenuItemRender={(item, dom) => (item.path ? <Link to={item.path}>{dom}</Link> : dom)}
      menuProps={{
        openKeys,
        selectedKeys,
        onOpenChange: () => undefined,
        onClick: ({ key }) => {
          if (typeof key === "string" && key.startsWith("/")) navigate(key);
        },
      }}
      route={{
        path: "/",
        routes: inWorkspace && productId ? workspaceRoutes(productId) : platformRoutes(isAdmin(user)),
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
            <Avatar size={28} style={{ background: palette.primary, color: "#fff", cursor: "pointer", fontSize: 12 }}>
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
          className={[fullBleed ? "pkm-pano-page" : "", isHome ? "pkm-home-page" : ""].filter(Boolean).join(" ") || undefined}
          title={false}
          pageHeaderRender={false}
        >
          <div className={`pkm-page${fullBleed ? " is-bleed" : ""}${isHome ? " is-home" : ""}`}>
            {isHome ? null : <Breadcrumb className="pkm-breadcrumb" items={pageCrumbs(location.pathname, currentProduct?.name)} />}
            <div className="pkm-page-body">
              <PageErrorBoundary resetKey={location.pathname + location.search + String(currentProduct?.id || "")}>
                <Outlet key={String(productId || "platform")} />
              </PageErrorBoundary>
            </div>
          </div>
        </PageContainer>
      </WorkspaceProvider>
    </ProLayout>
  );
}
