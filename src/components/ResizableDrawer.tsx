import { Drawer } from "antd";
import type { DrawerProps } from "antd";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

type Props = DrawerProps & {
  /** 拖拽最小宽度。 */
  minWidth?: number;
  /** 拖拽最大宽度，默认接近视口。 */
  maxWidth?: number;
};

/**
 * 右侧抽屉：默认宽度打开，左边可拖改宽，受最小/最大宽度限制。
 */
export default function ResizableDrawer({
  width: widthProp = 720,
  minWidth = 400,
  maxWidth,
  children,
  open,
  rootClassName,
  styles,
  drawerRender,
  ...rest
}: Props) {
  const [width, setWidth] = useState(() => Number(widthProp) || 720);
  const widthRef = useRef(width);
  const dragging = useRef(false);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  widthRef.current = width;

  /**
   * 把宽度限制在最小/最大之间。
   * @param {number} value
   */
  const clamp = (value: number) => {
    const view = typeof window === "undefined" ? 1440 : window.innerWidth;
    const max = maxWidth ?? Math.min(view - 32, 1600);
    return Math.min(max, Math.max(minWidth, Math.round(value)));
  };

  useEffect(() => {
    if (open && !dragging.current) setWidth(clamp(Number(widthProp) || 720));
  }, [open, widthProp, minWidth, maxWidth]);

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      if (!drag.current) return;
      event.preventDefault();
      setWidth(clamp(drag.current.startW + (drag.current.startX - event.clientX)));
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [minWidth, maxWidth]);

  /**
   * 从抽屉左缘开始拖宽。
   * @param {PointerEvent} event
   */
  const onResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragging.current = true;
    drag.current = { startX: event.clientX, startW: widthRef.current };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  /**
   * 在抽屉内容外包一层拖拽条。
   * @param {ReactNode} node
   */
  const renderDrawer = (node: ReactNode) => {
    const inner = (
      <div className="pkm-drawer-shell">
        <div
          className="pkm-drawer-resizer"
          onPointerDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          title="拖拽调整宽度"
        />
        {node}
      </div>
    );
    return drawerRender ? drawerRender(inner) : inner;
  };

  return (
    <Drawer
      {...rest}
      open={open}
      width={width}
      rootClassName={["pkm-resizable-drawer", rootClassName].filter(Boolean).join(" ")}
      styles={{
        ...styles,
        wrapper: { overflow: "visible", ...(styles?.wrapper || {}) },
      }}
      drawerRender={renderDrawer}
    >
      {children}
    </Drawer>
  );
}
