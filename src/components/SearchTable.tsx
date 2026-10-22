import { ColumnHeightOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, Card, Checkbox, Col, ConfigProvider, Dropdown, Form, Row, Space, Table, Tooltip } from "antd";
import type { FormInstance } from "antd/es/form";
import type { ColumnsType, TablePaginationConfig, TableProps } from "antd/es/table";
import { Children, useEffect, useMemo, useState, type ReactNode } from "react";

export type Density = "mini" | "small" | "medium" | "large";

const DENSITY_OPTIONS: { name: string; value: Density }[] = [
  { name: "迷你", value: "mini" },
  { name: "偏小", value: "small" },
  { name: "中等", value: "medium" },
  { name: "偏大", value: "large" },
];

/**
 * 密度对应 Ant Design Table size；迷你额外加紧凑 class。
 * @param {Density} density
 */
function tableSizeOf(density: Density): TableProps["size"] {
  if (density === "large") return "large";
  if (density === "medium") return "middle";
  return "small";
}

export interface QueryFormProps {
  form?: FormInstance;
  loading?: boolean;
  onSearch: () => void;
  onReset: () => void;
  children: ReactNode;
}

/**
 * Arco 查询卡：三列栅格，末格右对齐「查询 / 重置」。
 */
export function QueryForm({ form, loading, onSearch, onReset, children }: QueryFormProps) {
  const items = Children.toArray(children);
  return (
    <Card className="pkm-query-card" size="small">
      <Form
        form={form}
        layout="horizontal"
        colon
        onFinish={onSearch}
        labelAlign="right"
        labelCol={{ flex: "0 0 92px" }}
        wrapperCol={{ flex: "1 1 0" }}
      >
        <Row gutter={16} align="middle">
          {items.map((child, index) => (
            <Col key={index} xs={24} sm={12} md={items.length >= 3 ? 6 : 8}>
              {child}
            </Col>
          ))}
          <Col xs={24} sm={12} md={items.length >= 3 ? 6 : items.length % 3 === 0 ? 24 : (3 - (items.length % 3)) * 8}>
            <Form.Item className="pkm-query-actions" colon={false} labelCol={{ flex: "0 0 0px" }} wrapperCol={{ flex: "1 1 auto" }}>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}>
                  查询
                </Button>
                <Button htmlType="button" onClick={onReset}>
                  重置
                </Button>
              </Space>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}

export interface SearchColumn<T> extends Record<string, unknown> {
  title?: ReactNode;
  dataIndex?: string;
  key?: string;
  hideable?: boolean;
}

export type ResultColumn<T> = ColumnsType<T>[number] & { hideable?: boolean };

export interface ResultTableProps<T> extends Omit<TableProps<T>, "pagination" | "size" | "columns"> {
  columns: ResultColumn<T>[];
  operations?: ReactNode;
  extra?: ReactNode;
  onRefresh?: () => void;
  pagination?: false | TablePaginationConfig;
  defaultDensity?: Density;
  /** 是否显示全局序号列，默认显示。 */
  showIndex?: boolean;
}

/**
 * 列的稳定键，供显示/排序使用。
 * @param {ColumnsType<T>[number]} column
 * @param {number} index
 */
function columnKey<T>(column: ColumnsType<T>[number], index: number) {
  return String(column.key || (column as SearchColumn<T>).dataIndex || index);
}

/**
 * 是否为操作列。
 * @param {ResultColumn<T>} column
 */
function isOpsColumn<T>(column: ResultColumn<T>) {
  if (column.key === "operations") return true;
  const dataIndex = (column as SearchColumn<T>).dataIndex;
  return column.title === "操作" && (dataIndex == null || dataIndex === "");
}

/**
 * 把操作列钉在顺序末尾，避免列设置拖到中间。
 * @param {string[]} keys
 * @param {ResultColumn<T>[]} columns
 */
function pinOpsLast<T>(keys: string[], columns: ResultColumn<T>[]) {
  const rest: string[] = [];
  const ops: string[] = [];
  keys.forEach((key) => {
    const column = columns.find((item, index) => columnKey(item, index) === key);
    if (column && isOpsColumn(column)) ops.push(key);
    else rest.push(key);
  });
  return [...rest, ...ops];
}

/** 常见列默认宽度，避免标题被挤成竖排。 */
const COLUMN_WIDTHS: Record<string, number> = {
  "#": 56,
  名称: 168,
  摘要: 280,
  维护人: 140,
  状态: 180,
  操作: 176,
  页面类型: 108,
  使用角色: 140,
  所属模块: 128,
};

/**
 * 把 antd 列标题收成可渲染节点。
 * @param {ColumnsType<T>[number]["title"]} title
 */
function titleNodeOf<T>(title: ColumnsType<T>[number]["title"]): ReactNode {
  return typeof title === "function" ? title({} as never) : title;
}

/**
 * 按列标题估一个最小宽度。
 * @param {ReactNode} title
 */
function widthOfTitle(title: ReactNode): number {
  if (typeof title === "string" && COLUMN_WIDTHS[title]) return COLUMN_WIDTHS[title];
  if (typeof title !== "string") return 112;
  return Math.min(240, Math.max(96, title.length * 16 + 32));
}

/**
 * 默认分页：每页 20 条，可跳转、可改页容量，切页保留筛选。
 */
const SEARCH_PAGINATION: TablePaginationConfig = {
  current: 1,
  pageSize: 20,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ["10", "20", "50", "100"],
  showTotal: (total) => `共 ${total} 条`,
};

/**
 * Arco 结果卡：操作列固定最右；列宽按标题和内容给最小宽，超出再横向滚动。
 */
export function ResultTable<T extends object>({
  columns,
  operations,
  extra,
  onRefresh,
  pagination,
  defaultDensity = "medium",
  showIndex = true,
  className,
  ...tableProps
}: ResultTableProps<T>) {
  const [density, setDensity] = useState<Density>(defaultDensity);
  const [page, setPage] = useState({ current: 1, pageSize: 20 });
  const [order, setOrder] = useState<string[]>(() => pinOpsLast(columns.map((column, index) => columnKey(column, index)), columns));
  const [hidden, setHidden] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const dataCount = Array.isArray(tableProps.dataSource) ? tableProps.dataSource.length : 0;

  const columnKeys = columns.map((column, index) => columnKey(column, index)).join("|");

  useEffect(() => {
    const keys = columnKeys ? columnKeys.split("|") : [];
    setOrder((prev) => {
      const kept = prev.filter((key) => keys.includes(key));
      const missing = keys.filter((key) => !prev.includes(key));
      const next = pinOpsLast(kept.length || missing.length ? [...kept, ...missing] : keys, columns);
      if (next.length === prev.length && next.every((key, index) => key === prev[index])) return prev;
      return next;
    });
    setHidden((prev) => prev.filter((key) => keys.includes(key)));
  }, [columnKeys]);

  useEffect(() => {
    if (pagination !== false && pagination?.current != null) return;
    setPage((prev) => (prev.current === 1 ? prev : { ...prev, current: 1 }));
  }, [dataCount]);

  const visibleColumns = useMemo(() => {
    const map = new Map(columns.map((column, index) => [columnKey(column, index), column]));
    const ordered = order
      .filter((key) => !hidden.includes(key))
      .map((key) => map.get(key))
      .filter((column): column is ResultColumn<T> => !!column);
    const rest = ordered.filter((column) => !isOpsColumn(column));
    const ops = ordered.filter((column) => isOpsColumn(column));
    const indexCol: ResultColumn<T> | null = showIndex
      ? {
          title: "#",
          key: "__index",
          width: 56,
          hideable: true,
          render: (_: unknown, __: T, rowIndex: number) => (page.current - 1) * page.pageSize + rowIndex + 1,
        }
      : null;
    return [...(indexCol ? [indexCol] : []), ...rest, ...ops].map((column) => {
      const width = typeof column.width === "number" ? column.width : widthOfTitle(titleNodeOf(column.title));
      const opsCol = isOpsColumn(column);
      return {
        ...column,
        width,
        ellipsis: opsCol ? false : column.ellipsis,
        fixed: opsCol ? ("right" as const) : undefined,
        onHeaderCell: () => ({ style: { whiteSpace: "nowrap" as const, minWidth: width } }),
        onCell: () => ({
          className: opsCol ? "pkm-table-ops-cell" : "pkm-table-wrap-cell",
          style: { minWidth: width },
        }),
      };
    });
  }, [columns, order, hidden, showIndex, page]);

  /**
   * 拖拽结束后交换列顺序，操作列始终留在最后。
   * @param {string} target
   */
  const dropOn = (target: string) => {
    if (!dragKey || dragKey === target) return;
    const sourceCol = columns.find((column, index) => columnKey(column, index) === dragKey);
    const targetCol = columns.find((column, index) => columnKey(column, index) === target);
    if ((sourceCol && isOpsColumn(sourceCol)) || (targetCol && isOpsColumn(targetCol))) {
      setDragKey(null);
      return;
    }
    setOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(dragKey);
      const to = next.indexOf(target);
      if (from < 0 || to < 0) return pinOpsLast(prev, columns);
      next.splice(from, 1);
      next.splice(to, 0, dragKey);
      return pinOpsLast(next, columns);
    });
    setDragKey(null);
  };

  const mergedPagination =
    pagination === false
      ? false
      : {
          ...SEARCH_PAGINATION,
          ...pagination,
          current: pagination?.current ?? page.current,
          pageSize: pagination?.pageSize ?? page.pageSize,
          onChange: (current: number, pageSize: number) => {
            setPage({ current, pageSize });
            pagination?.onChange?.(current, pageSize);
          },
        };

  return (
    <Card className="pkm-result-card" size="small">
      <div className="pkm-result-toolbar">
        <div className="pkm-result-ops">{operations}</div>
        <div className="pkm-result-tools">
          {extra}
          {onRefresh ? (
            <Tooltip title="刷新">
              <button type="button" className="pkm-action-icon" onClick={onRefresh} aria-label="刷新">
                <ReloadOutlined />
              </button>
            </Tooltip>
          ) : null}
          <Dropdown
            trigger={["click"]}
            menu={{
              selectable: true,
              selectedKeys: [density],
              items: DENSITY_OPTIONS.map((item) => ({
                key: item.value,
                label: item.name,
                className: item.value === density ? "pkm-density-active" : undefined,
              })),
              onClick: ({ key }) => setDensity(key as Density),
            }}
          >
            <Tooltip title="密度">
              <button type="button" className="pkm-action-icon" aria-label="密度">
                <ColumnHeightOutlined />
              </button>
            </Tooltip>
          </Dropdown>
          <Dropdown
            trigger={["click"]}
            dropdownRender={() => (
              <div className="pkm-column-setting" id="tableSetting">
                {order.map((key) => {
                  const column = columns.find((item, index) => columnKey(item, index) === key);
                  if (!column) return null;
                  const ops = isOpsColumn(column);
                  const hideable = (column as SearchColumn<T>).hideable !== false && !ops;
                  const title = column.title === "#" ? "序列号" : column.title;
                  return (
                    <label
                      key={key}
                      className="pkm-column-setting-item"
                      draggable={!ops}
                      onDragStart={() => {
                        if (!ops) setDragKey(key);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropOn(key)}
                    >
                      <Checkbox
                        checked={!hidden.includes(key)}
                        disabled={!hideable}
                        onChange={(event) => {
                          setHidden((prev) => (event.target.checked ? prev.filter((item) => item !== key) : [...prev, key]));
                        }}
                      />
                      <span>{title as ReactNode}</span>
                    </label>
                  );
                })}
              </div>
            )}
          >
            <Tooltip title="列设置">
              <button type="button" className="pkm-action-icon" aria-label="列设置">
                <SettingOutlined />
              </button>
            </Tooltip>
          </Dropdown>
        </div>
      </div>
      <ConfigProvider getPopupContainer={() => document.body}>
        <Table<T>
          {...tableProps}
          scroll={{ ...tableProps.scroll, x: "max-content" }}
          className={`pkm-search-table${density === "mini" ? " pkm-table-mini" : ""}${className ? ` ${className}` : ""}`}
          size={tableSizeOf(density)}
          columns={visibleColumns}
          pagination={mergedPagination}
        />
      </ConfigProvider>
    </Card>
  );
}
