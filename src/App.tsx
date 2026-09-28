import { Spin } from "antd";
import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import AppLayout from "./pages/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import EntityRedirect from "./pages/EntityRedirect";
import AskPage from "./pages/AskPage";
import KnowledgeAppsPage from "./pages/KnowledgeAppsPage";
import HomePage from "./pages/HomePage";
import KnowledgeListPage from "./pages/KnowledgeListPage";
import KnowledgePackPage from "./pages/KnowledgePackPage";
import LandscapePage from "./pages/LandscapePage";
import LegacyRedirect from "./pages/LegacyRedirect";
import LoginPage from "./pages/LoginPage";
import PanoramaPage from "./pages/PanoramaPage";
import ProductsPage from "./pages/ProductsPage";
import ProductRelationsPage from "./pages/ProductRelationsPage";
import ProductWorkspaceGuard from "./pages/ProductWorkspaceGuard";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";
import SkillsPage from "./pages/SkillsPage";
import SourcesPage from "./pages/SourcesPage";
import { ProductProvider } from "./product";
import { ThemeProvider } from "./theme";

/**
 * 登录后才可进入工作台。
 */
function Private({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/**
 * 应用路由：平台公共页与产品知识工作台分离。
 */
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <Private>
                  <ProductProvider>
                    <AppLayout />
                  </ProductProvider>
                </Private>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="landscape" element={<LandscapePage />} />
              <Route path="ask" element={<AskPage />} />
              <Route path="apps" element={<KnowledgeAppsPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/:productId/ask" element={<Navigate to="/ask" replace />} />
              <Route path="products/:productId" element={<ProductWorkspaceGuard />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<DashboardPage />} />
                <Route path="structure" element={<PanoramaPage />} />
                <Route path="knowledge" element={<Navigate to="1" replace />} />
                <Route path="knowledge/:modelCode" element={<KnowledgeListPage />} />
                <Route path="sources" element={<SourcesPage />} />
                <Route path="relations" element={<ProductRelationsPage />} />
                <Route path="graph" element={<PanoramaPage />} />
                <Route path="pack" element={<KnowledgePackPage />} />
                <Route path="search" element={<SearchPage />} />
              </Route>
              <Route path="skills" element={<SkillsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="dashboard" element={<Navigate to="/" replace />} />
              <Route path="structure" element={<LegacyRedirect to="/structure" />} />
              <Route path="panorama" element={<LegacyRedirect to="/structure" />} />
              <Route path="knowledge/:modelCode" element={<LegacyRedirect to="/knowledge/$model" />} />
              <Route path="sources" element={<LegacyRedirect to="/sources" />} />
              <Route path="extract" element={<LegacyRedirect to="/sources" />} />
              <Route path="pack" element={<LegacyRedirect to="/pack" />} />
              <Route path="io" element={<LegacyRedirect to="/pack" />} />
              <Route path="graph" element={<LegacyRedirect to="/structure" />} />
              <Route path="search" element={<LegacyRedirect to="/search" />} />
              <Route path="changes" element={<LegacyRedirect to="" />} />
              <Route path="entity/new" element={<EntityRedirect mode="create" />} />
              <Route path="entity/:id" element={<EntityRedirect mode="view" />} />
              <Route path="entity/:id/edit" element={<EntityRedirect mode="edit" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
