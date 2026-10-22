import { ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ColorMode = "light" | "dark";

export interface Palette {
  canvas: string;
  bg: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  text3: string;
  accent: string;
  selected: string;
  hover: string;
  header: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
}

/** Arco Design 亮色：页面灰底、卡片白底、品牌蓝。 */
const LIGHT: Palette = {
  canvas: "#F7F8FA",
  bg: "#FFFFFF",
  elevated: "#FFFFFF",
  border: "#E5E6EB",
  text: "#1D2129",
  muted: "#4E5969",
  text3: "#86909C",
  accent: "#165DFF",
  selected: "#F2F3F5",
  hover: "#F7F8FA",
  header: "#FFFFFF",
  primary: "#165DFF",
  success: "#00B42A",
  warning: "#FF7D00",
  danger: "#F53F3F",
};

/** Arco Design 暗色：炭底、半透明白字、同款蓝。 */
const DARK: Palette = {
  canvas: "#17171A",
  bg: "#232324",
  elevated: "#2A2A2B",
  border: "#3A3A3B",
  text: "rgba(255,255,255,0.90)",
  muted: "rgba(255,255,255,0.70)",
  text3: "rgba(255,255,255,0.50)",
  accent: "#165DFF",
  selected: "rgba(22,93,255,0.16)",
  hover: "#2E2E30",
  header: "#232324",
  primary: "#165DFF",
  success: "#00B42A",
  warning: "#FF7D00",
  danger: "#F53F3F",
};

interface ThemeState {
  mode: ColorMode;
  palette: Palette;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function readMode(): ColorMode {
  const stored = localStorage.getItem("pkm_color_mode");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Arco 无衬线系统栈。 */
const FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';

/**
 * 把当前色板同步到根节点 CSS 变量，供非 Ant Design 区域使用。
 * @param {Palette} palette
 * @param {ColorMode} mode
 */
function applyCssVars(palette: Palette, mode: ColorMode) {
  const root = document.documentElement;
  root.dataset.colorMode = mode;
  root.style.colorScheme = mode;
  root.style.setProperty("--pkm-canvas", palette.canvas);
  root.style.setProperty("--pkm-bg", palette.bg);
  root.style.setProperty("--pkm-elevated", palette.elevated);
  root.style.setProperty("--pkm-border", palette.border);
  root.style.setProperty("--pkm-text", palette.text);
  root.style.setProperty("--pkm-muted", palette.muted);
  root.style.setProperty("--pkm-text-3", palette.text3);
  root.style.setProperty("--pkm-accent", palette.accent);
  root.style.setProperty("--pkm-selected", palette.selected);
  root.style.setProperty("--pkm-hover", palette.hover);
  root.style.setProperty("--pkm-header", palette.header);
  root.style.setProperty("--pkm-primary", palette.primary);
  root.style.setProperty("--pkm-primary-light", mode === "dark" ? "rgba(22,93,255,0.16)" : "#E8F3FF");
  root.style.setProperty("--pkm-success", palette.success);
  root.style.setProperty("--pkm-warning", palette.warning);
  root.style.setProperty("--pkm-danger", palette.danger);
  root.style.setProperty("--pkm-code-bg", mode === "dark" ? "#17171A" : "#F7F8FA");
}

/**
 * Arco Design 风格明暗主题，驱动 Ant Design Token 与 CSS 变量。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(() => (typeof window === "undefined" ? "light" : readMode()));
  const palette = mode === "dark" ? DARK : LIGHT;

  useEffect(() => {
    applyCssVars(palette, mode);
    localStorage.setItem("pkm_color_mode", mode);
  }, [mode, palette]);

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      palette,
      toggle: () => setMode((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [mode, palette],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        locale={zhCN}
        getPopupContainer={() => document.body}
        theme={{
          algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: palette.primary,
            colorInfo: palette.primary,
            colorSuccess: palette.success,
            colorWarning: palette.warning,
            colorError: palette.danger,
            colorLink: palette.primary,
            colorWhite: "#FFFFFF",
            colorBgLayout: palette.canvas,
            colorBgContainer: palette.bg,
            colorBgElevated: palette.elevated,
            colorBorder: palette.border,
            colorBorderSecondary: palette.border,
            colorText: palette.text,
            colorTextSecondary: palette.muted,
            colorTextTertiary: palette.text3,
            colorFillSecondary: palette.hover,
            colorFillTertiary: palette.hover,
            borderRadius: 2,
            borderRadiusLG: 4,
            borderRadiusSM: 2,
            fontFamily: FONT,
            fontSize: 14,
            controlHeight: 32,
            controlHeightLG: 36,
            controlHeightSM: 24,
            boxShadow: "none",
            boxShadowSecondary: "none",
          },
          components: {
            Layout: { headerBg: palette.header, bodyBg: palette.canvas, siderBg: palette.bg },
            Menu: {
              itemBg: "transparent",
              subMenuItemBg: "transparent",
              itemSelectedBg: palette.selected,
              itemHoverBg: palette.hover,
              itemSelectedColor: palette.text,
              itemColor: palette.muted,
              itemBorderRadius: 2,
              iconSize: 16,
            },
            Button: {
              primaryShadow: "none",
              defaultShadow: "none",
              borderRadius: 2,
              fontWeight: 400,
            },
            Card: {
              headerBg: "transparent",
              boxShadow: "none",
              borderRadiusLG: 4,
              paddingLG: 20,
            },
            Table: {
              headerBg: palette.hover,
              headerSplitColor: palette.border,
              borderColor: palette.border,
              headerColor: palette.muted,
              rowHoverBg: palette.selected,
            },
            Input: { borderRadius: 2 },
            Select: { borderRadius: 2 },
            Tag: { borderRadiusSM: 2, defaultBg: palette.hover },
            Tabs: {
              inkBarColor: palette.primary,
              itemSelectedColor: palette.primary,
              itemColor: palette.muted,
              itemHoverColor: palette.primary,
            },
            Drawer: { paddingLG: 20 },
            Modal: { borderRadiusLG: 4 },
            Pagination: {
              itemActiveBg: palette.primary,
              itemSize: 28,
            },
            Breadcrumb: { lastItemColor: palette.text, itemColor: palette.text3, linkColor: palette.muted, separatorColor: palette.text3 },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

/**
 * 读取当前外观。
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("ThemeProvider missing");
  return ctx;
}

/**
 * 画布 / SVG 随明暗模式变化的填充与描边。
 * @param {Palette} palette
 * @param {ColorMode} mode
 */
export function graphColors(palette: Palette, mode: ColorMode) {
  const dark = mode === "dark";
  return {
    canvas: palette.canvas,
    card: palette.bg,
    border: palette.border,
    text: palette.text,
    muted: palette.muted,
    accent: palette.primary,
    halo: palette.bg,
    barTrack: dark ? "#3A3A3B" : "#E5E6EB",
    litFill: dark ? "#3D2E12" : "#FFF7E8",
    litStroke: dark ? "#FF7D00" : "#FF7D00",
    litText: dark ? "#FF9A2E" : "#D25F00",
    litSub: dark ? "#FF7D00" : "#FF7D00",
    gold0: dark ? "#3D2E12" : "#FFF7E8",
    gold1: dark ? "#2A2100" : "#FFF1D6",
    edge: dark ? "rgba(255,255,255,0.35)" : "#C9CDD4",
    status: (dark
      ? {
          governed: { label: "已治理", color: "#00B42A", fill: "#0E2A16" },
          extracted: { label: "已抽取", color: "#4080FF", fill: "#122040" },
          incomplete: { label: "不完整", color: "#FF7D00", fill: "#2D1C08" },
          sourced: { label: "已挂来源", color: "rgba(255,255,255,0.5)", fill: "#2A2A2B" },
          ungoverned: { label: "未治理", color: "rgba(255,255,255,0.35)", fill: "#232324" },
        }
      : {
          governed: { label: "已治理", color: "#00B42A", fill: "#E8FFEA" },
          extracted: { label: "已抽取", color: "#165DFF", fill: "#E8F3FF" },
          incomplete: { label: "不完整", color: "#FF7D00", fill: "#FFF7E8" },
          sourced: { label: "已挂来源", color: "#86909C", fill: "#F7F8FA" },
          ungoverned: { label: "未治理", color: "#C9CDD4", fill: "#F7F8FA" },
        }) as Record<string, { label: string; color: string; fill: string }>,
  };
}

/**
 * ProLayout 随明暗模式变化的色板。
 * @param {Palette} palette
 */
export function layoutToken(palette: Palette) {
  return {
    bgLayout: palette.canvas,
    sider: {
      colorMenuBackground: palette.bg,
      colorTextMenu: palette.muted,
      colorTextMenuSelected: palette.text,
      colorTextMenuActive: palette.text,
      colorTextMenuItemHover: palette.text,
      colorBgMenuItemSelected: palette.selected,
      colorBgMenuItemHover: palette.hover,
      colorMenuItemDivider: palette.border,
      colorBgMenuItemCollapsedElevated: palette.bg,
    },
    header: {
      colorBgHeader: palette.header,
      colorHeaderTitle: palette.text,
      colorTextMenu: palette.muted,
      colorTextMenuSelected: palette.text,
      heightLayoutHeader: 60,
    },
    pageContainer: { paddingBlockPageContainerContent: 0, paddingInlinePageContainerContent: 0 },
  };
}
