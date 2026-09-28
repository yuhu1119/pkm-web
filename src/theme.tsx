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
  accent: string;
  selected: string;
  hover: string;
  header: string;
  primary: string;
}

/** OpenAI Platform 浅色：暖灰底、近黑正文、品牌绿点缀。 */
const LIGHT: Palette = {
  canvas: "#f4f4f4",
  bg: "#ffffff",
  elevated: "#ffffff",
  border: "#e5e5e5",
  text: "#0d0d0d",
  muted: "#6e6e80",
  accent: "#10a37f",
  selected: "#ececec",
  hover: "#f0f0f0",
  header: "#ffffff",
  primary: "#0d0d0d",
};

/** OpenAI Platform 深色：炭黑底、浅灰字、同款绿点缀。 */
const DARK: Palette = {
  canvas: "#171717",
  bg: "#212121",
  elevated: "#2a2a2a",
  border: "#3d3d3d",
  text: "#ececec",
  muted: "#9a9a9a",
  accent: "#10a37f",
  selected: "#333333",
  hover: "#2a2a2a",
  header: "#212121",
  primary: "#ececec",
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

const FONT =
  '"Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif';

/**
 * OpenAI Platform 风格明暗主题，驱动 Ant Design 与 CSS 变量。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(() => (typeof window === "undefined" ? "light" : readMode()));
  const palette = mode === "dark" ? DARK : LIGHT;

  useEffect(() => {
    document.documentElement.dataset.colorMode = mode;
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("pkm_color_mode", mode);
  }, [mode]);

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
        theme={{
          algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: palette.primary,
            colorInfo: palette.accent,
            colorSuccess: palette.accent,
            colorBgLayout: palette.canvas,
            colorBgContainer: palette.bg,
            colorBgElevated: palette.elevated,
            colorBorder: palette.border,
            colorBorderSecondary: palette.border,
            colorText: palette.text,
            colorTextSecondary: palette.muted,
            colorTextTertiary: palette.muted,
            colorLink: palette.text,
            borderRadius: 10,
            borderRadiusLG: 14,
            borderRadiusSM: 8,
            fontFamily: FONT,
            fontSize: 14,
            controlHeight: 36,
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
              itemBorderRadius: 8,
              iconSize: 16,
            },
            Button: {
              primaryShadow: "none",
              defaultShadow: "none",
              borderRadius: 8,
              fontWeight: 500,
            },
            Card: {
              headerBg: "transparent",
              boxShadow: "none",
              borderRadiusLG: 14,
            },
            Table: { headerBg: "transparent", headerSplitColor: "transparent", borderColor: palette.border },
            Input: { borderRadius: 8, paddingBlock: 8 },
            Select: { borderRadius: 8 },
            Tag: { borderRadiusSM: 999, defaultBg: palette.canvas },
            Tabs: {
              inkBarColor: palette.text,
              itemSelectedColor: palette.text,
              itemColor: palette.muted,
              itemHoverColor: palette.text,
            },
            Drawer: { paddingLG: 24 },
            Modal: { borderRadiusLG: 16 },
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
    accent: palette.accent,
    halo: palette.bg,
    barTrack: dark ? "#333333" : "#ececec",
    litFill: dark ? "#3d2f00" : "#fff7e6",
    litStroke: dark ? "#d29922" : "#faad14",
    litText: dark ? "#e3b341" : "#ad6800",
    litSub: dark ? "#d4a72c" : "#d48806",
    gold0: dark ? "#3d2f00" : "#fff7e6",
    gold1: dark ? "#2a2100" : "#fff1d6",
    edge: dark ? "#9a9a9a" : "#b4b4b4",
    status: (dark
      ? {
          governed: { label: "已治理", color: "#10a37f", fill: "#16352c" },
          extracted: { label: "已抽取", color: "#6cb6ff", fill: "#1b2a3a" },
          incomplete: { label: "不完整", color: "#d29922", fill: "#2d2108" },
          sourced: { label: "已挂来源", color: "#8b8b8b", fill: "#2a2a2a" },
          ungoverned: { label: "未治理", color: "#9a9a9a", fill: "#212121" },
        }
      : {
          governed: { label: "已治理", color: "#0d8a6a", fill: "#eef8f4" },
          extracted: { label: "已抽取", color: "#3b82c4", fill: "#f0f6fb" },
          incomplete: { label: "不完整", color: "#b8860b", fill: "#fff9eb" },
          sourced: { label: "已挂来源", color: "#6e6e80", fill: "#f4f4f4" },
          ungoverned: { label: "未治理", color: "#8c8c8c", fill: "#fafafa" },
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
      heightLayoutHeader: 56,
    },
    pageContainer: { paddingBlockPageContainerContent: 28, paddingInlinePageContainerContent: 32 },
  };
}
