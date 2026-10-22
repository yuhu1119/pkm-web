import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 根错误边界：避免未捕获渲染错误把整页卸成只剩背景色。
 */
export default class BootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("应用启动异常", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 48, maxWidth: 640, margin: "12vh auto", color: "#0d0d0d" }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>页面无法显示</h1>
          <p style={{ color: "#6e6e80", lineHeight: 1.6 }}>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
