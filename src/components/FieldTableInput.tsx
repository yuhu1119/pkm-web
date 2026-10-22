import { Button, Input } from "antd";
import { useEffect, useRef, useState } from "react";

/** 列分隔：ASCII `|` 与全角 `｜` 都认，避免旧抽取结果整行挤进第一列。 */
const CELL_SPLIT = /\s*[|｜]\s*/;

export const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "单行" },
  { value: "textarea", label: "多行" },
  { value: "select", label: "选项" },
  { value: "table", label: "表格" },
];

/**
 * 从填写说明推断表格列名：含 `|` 则当表头，含「分别写清 A、B」则用 类型/说明。
 * @param {string} hint
 * @returns {string[]}
 */
export function columnsFromHint(hint: string): string[] {
  const text = (hint || "").trim();
  if (/[|｜]/.test(text)) {
    const chunks = [text, ...text.split(/[。；;\n]/)];
    for (let i = chunks.length - 1; i >= 0; i -= 1) {
      const chunk = chunks[i];
      if (!/[|｜]/.test(chunk)) continue;
      const body = chunk.replace(/^[^|｜:：]+[:：]\s*/, "").trim();
      const parts = body
        .split(/[|｜]/)
        .map((part) => part.replace(/^[（(]\d+[）)]/, "").trim().replace(/^[，,、;；]+|[，,、;；]+$/g, ""))
        .filter((part) => part.length >= 1 && part.length <= 24);
      if (parts.length >= 2) return parts;
    }
  }
  const match = text.match(/(?:分别写清|分行写清|写清)([^。；\n]+)/);
  if (match) {
    const parts = match[1]
      .split(/[、，,]/)
      .map((part) => part.replace(/[：:\s]+$/g, "").trim())
      .filter((part) => part.length >= 2 && part.length <= 18);
    if (parts.length >= 2) return ["类型", "说明"];
  }
  return [];
}

/**
 * 把入库文本拆成表格行。兼容 `|` / `｜` 分列、换行分行，以及 JSON 数组。
 * @param {string} raw
 * @param {string[]} columns
 * @returns {string[][]}
 */
export function parseTableValue(raw: string, columns: string[]): string[][] {
  const width = Math.max(columns.length, 1);
  const text = (raw || "").trim();
  if (!text) return [Array.from({ length: width }, () => "")];
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const data = JSON.parse(text);
      const rows = Array.isArray(data) ? data : [data];
      const parsed = rows.map((item: unknown) => {
        if (Array.isArray(item)) return padRow(item.map((cell) => String(cell ?? "")), width);
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (columns.length) return padRow(columns.map((col) => String(record[col] ?? "")), width);
          return padRow(Object.values(record).map((cell) => String(cell ?? "")), width);
        }
        return padRow([String(item ?? "")], width);
      });
      return parsed.length ? parsed : [Array.from({ length: width }, () => "")];
    } catch {
      /* 按纯文本拆 */
    }
  }
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [Array.from({ length: width }, () => "")];
  return lines.map((line) => padRow(line.split(CELL_SPLIT), width));
}

/**
 * 表格行存成「列用 | 分隔、行换行」的文本，与抽取约定一致。
 * @param {string[][]} rows
 * @returns {string}
 */
export function serializeTableValue(rows: string[][]): string {
  return rows
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row) => row.map((cell) => String(cell || "").trim()).join(" | "))
    .join("\n");
}

/**
 * @param {string[]} cells
 * @param {number} width
 * @returns {string[]}
 */
function padRow(cells: string[], width: number): string[] {
  const next = cells.slice(0, width);
  while (next.length < width) next.push("");
  return next;
}

type Props = {
  value?: string;
  onChange?: (value: string) => void;
  columns?: string[];
  disabled?: boolean;
};

/**
 * 表格形态字段编辑器。值仍是字符串，详情页、抽取、下载共用同一套列定义。
 * 空行只留在编辑态：入库会去掉空行，若只靠 value 回显，「添加一行」会被立刻丢掉。
 */
export default function FieldTableInput({ value, onChange, columns, disabled }: Props) {
  const headers = columns?.length ? columns : ["列1", "列2"];
  const headerKey = headers.join("\0");
  const [rows, setRows] = useState(() => parseTableValue(value || "", headers));
  const emittedRef = useRef(serializeTableValue(parseTableValue(value || "", headers)));

  useEffect(() => {
    const incoming = value || "";
    if (incoming === emittedRef.current) return;
    emittedRef.current = incoming;
    setRows(parseTableValue(incoming, headers));
  }, [value, headerKey]);

  /**
   * @param {string[][]} next
   */
  const emit = (next: string[][]) => {
    const width = headers.length;
    const normalized = (next.length ? next : [headers.map(() => "")]).map((row) => padRow(row, width));
    setRows(normalized);
    const serialized = serializeTableValue(normalized);
    emittedRef.current = serialized;
    onChange?.(serialized);
  };

  return (
    <div className="pkm-field-table">
      <table>
        <thead>
          <tr>
            {headers.map((col) => (
              <th key={col}>{col}</th>
            ))}
            {disabled ? null : <th style={{ width: 52 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((col, colIndex) => (
                <td key={col}>
                  <Input
                    value={row[colIndex] || ""}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = rows.map((item) => [...item]);
                      next[rowIndex][colIndex] = e.target.value;
                      emit(next);
                    }}
                  />
                </td>
              ))}
              {disabled ? null : (
                <td>
                  <Button
                    type="link"
                    danger
                    htmlType="button"
                    disabled={rows.length <= 1}
                    onClick={() => emit(rows.filter((_, i) => i !== rowIndex))}
                  >
                    删
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {disabled ? null : (
        <Button type="dashed" size="small" htmlType="button" onClick={() => emit([...rows, headers.map(() => "")])}>
          添加一行
        </Button>
      )}
    </div>
  );
}
