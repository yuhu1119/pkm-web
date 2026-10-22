import { Alert, Button, Empty, Input, Space, Table, Tag, Upload, message } from "antd";
import ResizableDrawer from "./ResizableDrawer";
import { useEffect, useMemo, useState } from "react";
import { api, apiErrorDetail, asList, asPayload, extractedPayload, ingestJoySpace, isLlmUnavailableError, JOYSPACE_URL_HINT, JOYSPACE_URL_PLACEHOLDER, joySpacePageId, llmUnavailableReason, uploadSourceDocument, type KnowledgeType } from "../api";
import { annotateExtracted, extractTypeInstance, sourceText } from "../llmExtract";
import { LOCAL_DOC_ACCEPT, readLocalDocument } from "../localDoc";
import ExtractCompareModal from "./ExtractCompareModal";

interface Props {
  open: boolean;
  typeId: string;
  entityId?: number;
  onClose: () => void;
  onOpenDraft?: (id: number, typeId: string) => void;
}

interface ExtractedInstance {
  _uid?: string;
  type_id: string;
  type_name?: string;
  name: string;
  summary?: string;
  evidence?: string;
  write_action?: string;
  write_reason?: string;
  similar?: { id: number; name: string }[];
  matched_id?: number;
  payload?: Record<string, string>;
  tags?: string[];
}

/**
 * 统计 payload 里已填字段数。
 * @param {Record<string, string> | undefined} payload
 */
function filledFieldCount(payload?: Record<string, string>) {
  return Object.values(asPayload(payload)).filter((value) => String(value || "").trim()).length;
}

/**
 * 从文档写入当前对象类型：上传或读 JoySpace 链接 → 抽出结果 → 新建或覆盖已有。
 */
export default function SourcePipelineDrawer({ open, typeId, entityId, onClose, onOpenDraft }: Props) {
  const [working, setWorking] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [rows, setRows] = useState<ExtractedInstance[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [compareRow, setCompareRow] = useState<ExtractedInstance | null>(null);
  const [committing, setCommitting] = useState(false);
  const [failReason, setFailReason] = useState("");

  useEffect(() => {
    if (!open) {
      setWorking(null);
      setRows([]);
      setSkipped([]);
      setCompareRow(null);
      setFailReason("");
      setUrl("");
      setFetching(false);
    }
  }, [open]);

  const createRows = useMemo(
    () => rows.filter((item) => item.write_action === "create" && !skipped.includes(item._uid || "")),
    [rows, skipped],
  );
  const conflictRows = useMemo(
    () =>
      rows.filter(
        (item) =>
          (item.write_action === "compare_update" || (item.similar || []).length || item.matched_id) &&
          !skipped.includes(item._uid || ""),
      ),
    [rows, skipped],
  );

  /**
   * 上传后直接按当前对象类型抽取。
   * @param {any} source
   */
  const analyze = async (source: any) => {
    setWorking(source);
    setLoading(true);
    setRows([]);
    setSkipped([]);
    setFailReason("");
    try {
      const text = await sourceText(source);
      if (!text) {
        message.warning("来源没有正文");
        setWorking(null);
        return;
      }
      const types = await api.get("/api/meta/types");
      const type = asList<KnowledgeType>(types.data).find((item) => item.entity_id === typeId);
      if (!type) {
        message.error("对象类型不存在");
        setWorking(null);
        return;
      }
      const raw = await extractTypeInstance(type, text);
      const list = (await annotateExtracted([raw], entityId)).filter((item) => item.type_id === typeId);
      setRows(
        list.map((item, index) => ({
          ...(item as unknown as ExtractedInstance),
          payload: extractedPayload(item),
          write_action: String(item.write_action || "create"),
          _uid: `${item.type_id}-${index}-${item.name}`,
        })),
      );
      if (!list.length) {
        message.warning("没有抽出当前类型的内容，可换一份文档再试");
      }
    } catch (err) {
      const reason = isLlmUnavailableError(err) ? llmUnavailableReason(err) : apiErrorDetail(err, "抽取失败");
      setFailReason(reason);
      message.error(reason);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 用 JoySpace 在线文档作为当前对象的来源并抽取。
   */
  const fetchJoySpace = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      message.warning("请粘贴 JoySpace 文档链接");
      return;
    }
    if (!joySpacePageId(trimmed)) {
      message.error("请粘贴 https://joyspace.jd.com 开头的文档链接");
      return;
    }
    setFetching(true);
    try {
      const res = await ingestJoySpace(trimmed, typeId);
      setUrl("");
      if (res.data?.id) {
        await analyze(res.data);
      } else {
        message.warning("已抓取，但没有得到来源编号");
      }
    } catch (err) {
      message.error(apiErrorDetail(err, "读取 JoySpace 失败"));
    } finally {
      setFetching(false);
    }
  };

  /**
   * 写入新建项，以及指定要覆盖的重复项。
   * @param {ExtractedInstance[]} overwriteRows
   */
  const commitRows = async (overwriteRows: ExtractedInstance[] = []) => {
    if (!working) return;
    const creates = createRows;
    if (!creates.length && !overwriteRows.length) {
      message.warning("没有可写入的条目");
      return;
    }
    setCommitting(true);
    try {
      const instances = [
        ...creates.map((item) => ({
          ...item,
          payload: extractedPayload(item as unknown as Record<string, unknown>),
          conflict_action: "create",
        })),
        ...overwriteRows.map((item) => ({
          ...item,
          payload: extractedPayload(item as unknown as Record<string, unknown>),
          matched_id: item.matched_id || item.similar?.[0]?.id,
          conflict_action: "overwrite",
        })),
      ];
      const res = await api.post("/api/extract/commit", {
        source_id: working.id,
        instances,
      });
      const created = res.data.created || 0;
      const updated = res.data.updated || 0;
      message.success(created || updated ? `已写入 ${created} 条新建${updated ? `，覆盖 ${updated} 条` : ""}` : "没有新写入");
      window.dispatchEvent(new Event("pkm-refresh"));
      const first = (res.data.drafts || [])[0] || (res.data.overwrites || [])[0];
      if (first?.id) onOpenDraft?.(first.id, first.type_id);
      onClose();
    } catch (err) {
      message.error(apiErrorDetail(err, "写入失败"));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <ResizableDrawer
      title={`从文档写入 · ${typeId}`}
      open={open}
      onClose={onClose}
      width={760}
      minWidth={420}
      destroyOnClose
      maskClosable={false}
      keyboard={false}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Alert type="info" showIcon message="上传本地文件或粘贴 JoySpace 链接后，只写入当前对象类型。额度用尽或配置不正确时文档仍会保存，但不会自动填字段，请手工新建并治理。" />
        {failReason ? <Alert type="error" showIcon message={failReason} /> : null}
        <div>
          <div className="pkm-muted" style={{ marginBottom: 8 }}>本地文件</div>
          <Upload
            showUploadList={false}
            accept={LOCAL_DOC_ACCEPT}
            disabled={loading || fetching}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                const payload = await readLocalDocument(file as File);
                const res = await uploadSourceDocument(payload, typeId);
                onSuccess && onSuccess({}, new XMLHttpRequest());
                if (res.data?.id) {
                  await analyze(res.data);
                } else {
                  message.warning("上传完成，但没有得到来源编号");
                }
              } catch (e) {
                message.error(apiErrorDetail(e, "上传失败"));
                onError && onError(e as Error);
              }
            }}
          >
            <Button type="primary" loading={loading && !fetching} disabled={fetching}>
              {working ? "换一份文档" : "上传文档"}
            </Button>
          </Upload>
        </div>
        <div>
          <div className="pkm-muted" style={{ marginBottom: 8 }}>JoySpace 在线文档</div>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPressEnter={fetchJoySpace}
              placeholder={JOYSPACE_URL_PLACEHOLDER}
              disabled={loading || fetching}
              allowClear
            />
            <Button type="primary" loading={fetching} disabled={loading} onClick={fetchJoySpace}>
              读取
            </Button>
          </Space.Compact>
          <div className="pkm-muted" style={{ marginTop: 8 }}>
            {JOYSPACE_URL_HINT}
          </div>
        </div>

        {loading ? <div className="pkm-muted">正在抽取当前对象类型…</div> : null}

        {!loading && working && !rows.length && !failReason ? (
          <Empty description="没有抽出当前类型的内容" />
        ) : null}

        {createRows.length ? (
          <div>
            <div style={{ marginBottom: 8 }}>将新建</div>
            <Table
              rowKey="_uid"
              size="small"
              pagination={false}
              scroll={{ x: 560 }}
              dataSource={createRows}
              columns={[
                { title: "名称", dataIndex: "name", width: 160, ellipsis: true },
                { title: "摘要", dataIndex: "summary", ellipsis: true },
                {
                  title: "已填字段",
                  width: 88,
                  render: (_: unknown, row) => {
                    const count = filledFieldCount(row.payload);
                    return count ? `${count} 项` : "待补充";
                  },
                },
                { title: "", width: 72, render: () => <Tag color="green">新建</Tag> },
              ]}
            />
          </div>
        ) : null}

        {conflictRows.length ? (
          <div>
            <div style={{ marginBottom: 8 }}>与已有知识重复或相似</div>
            <Table
              rowKey="_uid"
              size="small"
              pagination={false}
              scroll={{ x: 560 }}
              dataSource={conflictRows}
              columns={[
                { title: "文档中的内容", dataIndex: "name", width: 160, ellipsis: true },
                {
                  title: "已有知识",
                  ellipsis: true,
                  render: (_: unknown, row) =>
                    row.similar?.[0]?.name || (row.matched_id ? `#${row.matched_id}` : "同名已有"),
                },
                {
                  title: "操作",
                  width: 168,
                  align: "right",
                  className: "pkm-table-ops-cell",
                  render: (_: unknown, row) => (
                    <div className="pkm-table-ops">
                      <Button type="link" onClick={() => setCompareRow(row)}>
                        比较
                      </Button>
                      <Button type="link" loading={committing} onClick={() => commitRows([row])}>
                        覆盖
                      </Button>
                      <Button type="link" onClick={() => setSkipped((prev) => [...prev, row._uid || ""])}>
                        不覆盖
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        ) : null}

        {working && !loading ? (
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" loading={committing} onClick={() => commitRows(conflictRows)} disabled={!createRows.length && !conflictRows.length}>
              {createRows.length || conflictRows.length
                ? `写入${createRows.length ? ` ${createRows.length} 条新建` : ""}${conflictRows.length ? `并覆盖 ${conflictRows.length} 条` : ""}`
                : "没有可写入的条目"}
            </Button>
          </Space>
        ) : null}
      </Space>
      <ExtractCompareModal
        open={!!compareRow}
        row={compareRow}
        sourceId={working?.id}
        onClose={() => setCompareRow(null)}
        onDone={() => {
          if (compareRow?._uid) setSkipped((prev) => [...prev, compareRow._uid || ""]);
          setCompareRow(null);
        }}
      />
    </ResizableDrawer>
  );
}
