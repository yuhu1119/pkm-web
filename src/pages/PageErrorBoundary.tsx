import { Button, Result } from "antd";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  error: Error | null;
}

/**
 * 页面级错误边界：路由变化后自动恢复，避免整站卡死。
 */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("页面渲染异常", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="页面出现异常"
          subTitle={this.state.error.message || "请返回其他菜单后重试"}
          extra={
            <Button type="primary" onClick={() => this.setState({ error: null })}>
              重试当前页
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
