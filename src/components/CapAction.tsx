import { message } from "antd";
import { cloneElement, isValidElement, type MouseEvent, type ReactElement, type ReactNode } from "react";

/**
 * 无权限时把子按钮置灰，点击仍提示原因。
 */
export default function CapAction({
  allowed,
  hint,
  children,
}: {
  allowed: boolean;
  hint: string;
  children: ReactNode;
}) {
  if (allowed) return <>{children}</>;
  const child = isValidElement(children) ? (children as ReactElement<{ disabled?: boolean; style?: object }>) : null;
  return (
    <span
      style={{ display: "inline-block", cursor: "not-allowed" }}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        message.warning(hint);
      }}
    >
      {child
        ? cloneElement(child, {
            disabled: true,
            style: { ...(child.props.style || {}), pointerEvents: "none" },
          })
        : children}
    </span>
  );
}
