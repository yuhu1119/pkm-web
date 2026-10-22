import { Alert, Button, Card, Checkbox, Form, Input, Modal, Progress, Select, Space, Steps, Table, Tag, Upload, message } from "antd";
import ResizableDrawer from "../components/ResizableDrawer";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  apiErrorDetail,
  asList,
  ingestJoySpace,
  isDbTimeoutError,
  isLlmUnavailableError,
  JOYSPACE_URL_HINT,
  JOYSPACE_URL_PLACEHOLDER,
  joySpacePageId,
  llmUnavailableReason,
  uploadSourceDocument,
} from "../api";
import { CAP_HINTS, canWriteProduct, hasCap, isAdmin, useAuth } from "../auth";
import CapAction from "../components/CapAction";
import { LOCAL_DOC_ACCEPT, readLocalDocument } from "../localDoc";
import { KNOWLEDGE_MODELS, workspacePath } from "../paths";
import { useProduct } from "../product";
import ExtractCompareModal from "../components/ExtractCompareModal";
import { QueryForm, ResultTable } from "../components/SearchTable";

const EXTRACT_META: Record<string, { label: string; color: string }> = {
  none: { label: "未分析", color: "default" },
  success: { label: "已分析", color: "success" },
  failed: { label: "分析失败", color: "error" },
};

const SOURCE_KIND: Record<string, string> = {
  local: "本地文档",
  feishu: "飞书",
  joyspace: "JoySpace",
  web: "在线链接",
};

/**
 * 来源列：有链接显示 http 地址，否则「本地文档」。
 * @param {any} row
 */
function sourceOrigin(row: any): string {
  return String(row?.url || "").trim() || "本地文档";
}

/**
 * 列表标题：已存的链接不当标题，改从正文第一行取。
 * @param {any} row
 */
function displaySourceTitle(row: any): string {
  const stored = String(row?.title || "").trim();
  if (stored && !/^https?:\/\//i.test(stored) && !/^www\./i.test(stored)) {
    return stored;
  }
  const content = String(row?.content || "").replace(/^\uFEFF/, "");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim().replace(/^#+\s+/, "");
    if (!line || /^https?:\/\//i.test(line)) continue;
    if (line.length <= 80) return line;
    break;
  }
  return "未命名文档";
}

interface ExtractedInstance {
  _uid: string;
  type_id: string;
  type_name?: string;
  model_code?: number;
  model_name?: string;
  name: string;
  summary?: string;
  payload?: Record<string, string>;
  confidence?: number;
  evidence?: string;
  tags?: string[];
  write_action?: string;
  write_reason?: string;
  matched_id?: number;
  protected?: boolean;
  similar?: { id: number; name: string; type_name?: string; model_name?: string; kind?: string }[];
  needs_compare?: boolean;
  source_ids?: number[];
  changed_keys?: string[];
  fill_payload?: Record<string, string>;
  fill_summary?: string;
  contradictions?: { key: string; label?: string; existing?: string; incoming?: string; note?: string }[];
}

const WRITE_ACTION: Record<string, { label: string; color: string }> = {
  create: { label: "将新建草稿", color: "green" },
  compare_update: { label: "需比较后更新", color: "orange" },
  skip_locked_type: { label: "类型已锁定", color: "purple" },
  skip_locked: { label: "实例已锁定", color: "purple" },
  skip_published: { label: "已发布，跳过", color: "blue" },
  skip_existing: { label: "同名已有，跳过", color: "gold" },
  fill_fields: { label: "将补空字段", color: "blue" },
  skip_unchanged: { label: "无变化，只挂来源", color: "default" },
  possible_alias: { label: "可能同一条", color: "gold" },
};

const BATCH_ACTIONS = new Set(["create", "fill_fields", "skip_unchanged"]);

/**
 * 文档是否已经跑过整库/单篇分析。
 * @param {any} row
 */
function isAnalyzed(row: any) {
  return (row?.extract_status || "none") === "success" || Number(row?.coverage?.instance_count || 0) > 0;
}

/**
 * 知识收集：上传 PRD / 手册 / 在线文档，AI 按十大模型抽出对象实例草稿。
 */
export default function SourcesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [queryForm] = Form.useForm();
  const [filters, setFilters] = useState({ title: "", source_type: "", extract_status: "" });
  const [url, setUrl] = useState("");
  const [connector, setConnector] = useState("auto");
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<any>(null);
  const [modelCodes, setModelCodes] = useState<number[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0, code: 0, typeName: "" });
  const [catalogTypes, setCatalogTypes] = useState<{ entity_id: string; name: string; model_code: number }[]>([]);
  const [modelStatus, setModelStatus] = useState<Record<number, "wait" | "run" | "ok" | "fail" | "empty">>({});
  const [instances, setInstances] = useState<ExtractedInstance[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [extractFailReason, setExtractFailReason] = useState("");
  const [compareRow, setCompareRow] = useState<ExtractedInstance | null>(null);
  const [fromTypeName, setFromTypeName] = useState("");
  const [docKind, setDocKind] = useState("");
  const [documentKinds, setDocumentKinds] = useState<any[]>([]);
  const [usedSkills, setUsedSkills] = useState<any[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [analyzingIds, setAnalyzingIds] = useState<number[]>([]);
  const [corpusDocs, setCorpusDocs] = useState<{ id: number; title: string }[]>([]);
  const [analyzeMode, setAnalyzeMode] = useState<"corpus" | "incremental">("corpus");
  const [hasKnowledge, setHasKnowledge] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { current } = useProduct();
  const productWritable = canWriteProduct(user, current);
  const canCollect = productWritable && hasCap(user, "source_write");
  const collectHint = productWritable ? CAP_HINTS.source_write : CAP_HINTS.product_write;
  const base = current?.id ? workspacePath(current.id) : "/products";
  const fromType = searchParams.get("fromType") || "";
  const analyzeId = Number(searchParams.get("analyze") || 0);

  /**
   * 刷新当前产品的来源列表。
   */
  const load = () =>
    api
      .get("/api/sources")
      .then((res) => setRows(asList(res.data)))
      .catch((err: unknown) => {
        message.error(apiErrorDetail(err, "文档列表加载失败"));
        setRows([]);
      });

  /**
   * 产品下是否已有知识实例，用来决定默认走整库还是增量。
   */
  const loadKnowledgeFlag = () =>
    api.get("/api/entities", { params: { lite: 1 } }).then((res) => setHasKnowledge(asList(res.data).length > 0)).catch(() => setHasKnowledge(false));

  useEffect(() => {
    load();
    loadKnowledgeFlag();
    api.get("/api/extract-skills").then((res) => setDocumentKinds(res.data.document_kinds || []));
    api.get("/api/meta/types").then((res) => setCatalogTypes(Array.isArray(res.data) ? res.data : []));
  }, [current?.id]);

  useEffect(() => {
    const onRefresh = () => loadKnowledgeFlag();
    window.addEventListener("pkm-refresh", onRefresh);
    return () => window.removeEventListener("pkm-refresh", onRefresh);
  }, [current?.id]);

  useEffect(() => {
    if (!fromType) {
      setFromTypeName("");
      return;
    }
    api.get("/api/meta/types").then((res) => {
      const found = (res.data || []).find((item: any) => item.entity_id === fromType);
      setFromTypeName(found ? `${found.entity_id} ${found.name}` : fromType);
    });
  }, [fromType]);

  useEffect(() => {
    if (!analyzeId) return;
    api.get(`/api/sources/${analyzeId}`).then((res) => {
      if (res.data?.status === "ready") confirmAndAnalyze([res.data]);
    });
  }, [analyzeId, current?.id]);

  const selectedInstances = useMemo(
    () => instances.filter((item) => selectedKeys.includes(item._uid)),
    [instances, selectedKeys],
  );

  /**
   * 关闭分析抽屉并清空中间状态。
   */
  const closeAnalyze = () => {
    setAnalyzing(null);
    setAnalyzingIds([]);
    setCorpusDocs([]);
    setStep(0);
    setScan(null);
    setDocKind("");
    setUsedSkills([]);
    setModelCodes([]);
    setExtracting(false);
    setInstances([]);
    setSelectedKeys([]);
    setModelStatus({});
    setCommitResult(null);
    setExtractFailReason("");
  };

  /**
   * 识别多篇资料并汇总覆盖的对象类型。
   * @param {any[]} docs
   * @param {"corpus" | "incremental"} [mode]
   */
  const startCorpus = async (docs: any[], mode: "corpus" | "incremental" = "corpus") => {
    const ready = docs.filter((item) => item?.id && item.status === "ready");
    if (!ready.length) {
      message.warning("没有可分析的文档");
      return;
    }
    setAnalyzeMode(mode);
    setAnalyzing({
      id: ready[0].id,
      title: ready.length === 1 ? displaySourceTitle(ready[0]) : `${ready.length} 篇资料`,
    });
    setAnalyzingIds(ready.map((item) => item.id));
    setCorpusDocs(ready.map((item) => ({ id: item.id, title: displaySourceTitle(item) })));
    setStep(0);
    setScan(null);
    setInstances([]);
    setSelectedKeys([]);
    setExtractFailReason("");
    setScanning(true);
    const hitMap = new Map<string, any>();
    const codeSet = new Set<number>();
    const kinds: string[] = [];
    let lastScan: any = null;
    let used: any[] = [];
    try {
      for (let i = 0; i < ready.length; i += 1) {
        const doc = ready[i];
        setExtractProgress({ current: i + 1, total: ready.length, code: 0, typeName: doc.title });
        const res = await api.post("/api/extract/scan", { source_id: doc.id });
        lastScan = res.data;
        if (res.data.document_kind) kinds.push(res.data.document_kind);
        if (res.data.used_skills) used = res.data.used_skills;
        (res.data.model_codes || []).forEach((code: number) => codeSet.add(Number(code)));
        (res.data.type_hits || []).forEach((hit: any) => {
          const prev = hitMap.get(hit.type_id);
          if (!prev) {
            hitMap.set(hit.type_id, { ...hit, source_ids: [doc.id] });
            return;
          }
          prev.source_ids = [...new Set([...(prev.source_ids || []), doc.id])];
          const names = [...(prev.instances || [])];
          (hit.instances || []).forEach((item: any) => {
            if (!names.some((row: any) => row.name === item.name)) names.push(item);
          });
          prev.instances = names;
        });
      }
      const typeHits = Array.from(hitMap.values());
      const kind = kinds.sort((a, b) => kinds.filter((item) => item === b).length - kinds.filter((item) => item === a).length)[0] || lastScan?.document_kind || "";
      setScan({
        ...(lastScan || {}),
        document_kind: kind,
        summary:
          mode === "incremental"
            ? `增量识别 ${ready.length} 篇，覆盖 ${typeHits.length} 类对象（未点名的类型会跳过）`
            : ready.length === 1
              ? lastScan?.summary || ""
              : `已识别 ${ready.length} 篇资料，覆盖 ${typeHits.length} 类对象`,
        type_hits: typeHits,
        model_codes: Array.from(codeSet),
      });
      setDocKind(kind);
      setUsedSkills(used);
      setModelCodes(Array.from(codeSet).length ? Array.from(codeSet) : [1]);
      setStep(0);
    } catch (err: unknown) {
      const reason = isLlmUnavailableError(err)
        ? llmUnavailableReason(err)
        : apiErrorDetail(err, isDbTimeoutError(err) ? "分析超时，请少勾选几篇再试" : "识别失败");
      message.error(reason);
      setExtractFailReason(reason);
    } finally {
      setScanning(false);
    }
  };

  /**
   * 已分析过则先确认，再进入整库或增量识别。
   * @param {any[]} docs
   * @param {"corpus" | "incremental"} [mode]
   */
  const confirmAndAnalyze = (docs: any[], mode: "corpus" | "incremental" = "corpus") => {
    const ready = docs.filter((item) => item?.status === "ready");
    if (!ready.length) {
      message.warning("请先勾选状态为「可分析」的文档");
      return;
    }
    const done = ready.filter(isAnalyzed);
    const run = () => startCorpus(ready, mode);
    if (mode === "incremental") {
      if (!hasKnowledge) {
        message.warning("知识库还没有实例，请先整库分析");
        return;
      }
      run();
      return;
    }
    if (!done.length) {
      run();
      return;
    }
    const names = done.map((item) => displaySourceTitle(item)).filter(Boolean);
    const shown = names.slice(0, 5).join("、");
    Modal.confirm({
      title: "部分文档已经分析过",
      content: `已选 ${ready.length} 篇，其中 ${done.length} 篇已经分析过${shown ? `（${shown}${names.length > 5 ? " 等" : ""}）` : ""}。再次分析会对照当前知识库重新抽取，已有实例不会自动覆盖。是否继续？`,
      okText: "继续分析",
      cancelText: "取消",
      onOk: run,
    });
  };

  /**
   * 按勾选的一级模型，对多篇资料覆盖的每一类对象做联合抽取。
   */
  const runExtract = async () => {
    if (!analyzingIds.length || !modelCodes.length) return;
    const jobs: { code: number; type_id: string; type_name: string }[] = [];
    const seen = new Set<string>();
    modelCodes.forEach((code) => {
      const hits = (scan?.type_hits || []).filter((hit: { type_id?: string; model_code?: number; type_name?: string }) => {
        if (Number(hit.model_code) === code) return true;
        const meta = catalogTypes.find((item) => item.entity_id === hit.type_id);
        return meta?.model_code === code;
      });
      hits.forEach((hit: { type_id?: string; type_name?: string }) => {
        if (!hit.type_id || seen.has(hit.type_id)) return;
        seen.add(hit.type_id);
        jobs.push({
          code,
          type_id: hit.type_id,
          type_name: hit.type_name || hit.type_id,
        });
      });
    });
    if (!jobs.length) {
      message.warning("当前勾选的模型下没有可抽取的对象类型");
      return;
    }
    setExtracting(true);
    setStep(1);
    const collected: ExtractedInstance[] = [];
    const status: Record<number, "wait" | "run" | "ok" | "fail" | "empty"> = {};
    let failReason = "";
    modelCodes.forEach((code) => {
      status[code] = "wait";
    });
    setModelStatus({ ...status });
    /** 多篇正文一次进库会触发 SpeedLoop「查询超时」，按 4 篇一批。 */
    const chunkSize = 4;
    const chunks: number[][] = [];
    for (let i = 0; i < analyzingIds.length; i += chunkSize) {
      chunks.push(analyzingIds.slice(i, i + chunkSize));
    }
    const totalWork = jobs.length * chunks.length;
    let work = 0;
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      if (status[job.code] !== "ok") status[job.code] = "run";
      setModelStatus({ ...status });
      try {
        for (let c = 0; c < chunks.length; c += 1) {
          work += 1;
          setExtractProgress({
            current: work,
            total: totalWork,
            code: job.code,
            typeName: chunks.length > 1 ? `${job.type_name}（${c + 1}/${chunks.length} 批）` : job.type_name,
          });
          const res = await api.post("/api/extract/corpus/type", {
            source_ids: chunks[c],
            type_id: job.type_id,
            document_kind: docKind,
            incremental: analyzeMode === "incremental",
          });
          const rows = (res.data.instances || []) as Omit<ExtractedInstance, "_uid">[];
          if (res.data.used_skills) setUsedSkills(res.data.used_skills);
          rows.forEach((item) => {
            const uid = `${job.code}-${item.type_id}-${item.name}`;
            const prev = collected.find((row) => row._uid === uid);
            if (prev) {
              prev.source_ids = [...new Set([...(prev.source_ids || []), ...(item.source_ids || chunks[c])])];
              return;
            }
            collected.push({
              ...item,
              _uid: uid,
              source_ids: item.source_ids || chunks[c],
            });
          });
        }
        if (collected.some((item) => item.type_id === job.type_id)) status[job.code] = "ok";
        else if (status[job.code] !== "ok") status[job.code] = "empty";
      } catch (err: unknown) {
        status[job.code] = "fail";
        failReason = isLlmUnavailableError(err)
          ? llmUnavailableReason(err)
          : apiErrorDetail(err, "抽取失败");
        message.error(failReason);
        break;
      }
      setModelStatus({ ...status });
    }
    setExtracting(false);
    setExtractFailReason(failReason);
    if (failReason && !collected.length) {
      setModelStatus({ ...status });
      return;
    }
    setInstances(collected);
    setSelectedKeys(collected.filter((item) => BATCH_ACTIONS.has(item.write_action || "")).map((item) => item._uid));
    setStep(2);
    if (!collected.length) {
      message.warning("未抽出可写入的实例。可换一份材料，或到知识治理中手工添加并编辑。");
    }
  };

  /**
   * 把勾选的分析结果写成待治理草稿。
   */
  const commitDrafts = async () => {
    if (!analyzingIds.length) return;
    if (!selectedInstances.length) {
      message.warning("请至少勾选一条实例");
      return;
    }
    setCommitting(true);
    try {
      const payload = selectedInstances
        .filter((item) => BATCH_ACTIONS.has(item.write_action || ""))
        .map((item) => ({
          type_id: item.type_id,
          name: item.name,
          summary: item.summary,
          payload: item.payload,
          tags: item.tags,
          confidence: item.confidence,
          evidence: item.evidence,
          model_code: item.model_code,
          source_ids: item.source_ids || analyzingIds,
          write_action: item.write_action,
          fill_payload: item.fill_payload,
          fill_summary: item.fill_summary,
          matched_id: item.matched_id,
        }));
      if (!payload.length) {
        message.warning("没有可批量写入的项。已治理或可能同一条请点「比较更新」。");
        setCommitting(false);
        return;
      }
      const res = await api.post("/api/extract/commit", {
        source_id: analyzingIds[0],
        source_ids: analyzingIds,
        instances: payload,
        incremental: analyzeMode === "incremental",
      });
      const created = res.data.created || 0;
      const filled = res.data.filled || 0;
      const boundOnly = res.data.bound_only || 0;
      const coverage = res.data.coverage || { types: [], instance_count: created };
      setCommitResult({
        created,
        filled,
        boundOnly,
        coverage,
        skipped: res.data.skipped || [],
        skippedCount: (res.data.skipped || []).length,
      });
      setStep(3);
      load();
      window.dispatchEvent(new Event("pkm-refresh"));
      const bits = [
        created ? `新建 ${created}` : "",
        filled ? `补字段 ${filled}` : "",
        boundOnly ? `挂来源 ${boundOnly}` : "",
        res.data.aliased ? `合并别名 ${res.data.aliased}` : "",
        res.data.updated ? `比较更新 ${res.data.updated}` : "",
      ].filter(Boolean);
      if (bits.length) {
        message.success(bits.join("，"));
      } else {
        message.info("没有新增草稿（可能与已有实例重名）");
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "写入失败");
    } finally {
      setCommitting(false);
    }
  };

  /**
   * 确认抽出名称是已有实例的别名，保留规范名并补空字段。
   * @param {ExtractedInstance} row
   */
  const commitAlias = (row: ExtractedInstance) => {
    if (!row.matched_id || !analyzingIds.length) {
      message.warning("没有可合并的已有实例");
      return;
    }
    Modal.confirm({
      title: "合并为别名",
      content: `将「${row.name}」并入已有实例，保留现有名称，并把新名称写入别名；空字段会补上，已有内容不覆盖。`,
      okText: "合并",
      cancelText: "取消",
      onOk: async () => {
        setCommitting(true);
        try {
          const res = await api.post("/api/extract/commit", {
            source_id: analyzingIds[0],
            source_ids: analyzingIds,
            incremental: analyzeMode === "incremental",
            instances: [
              {
                type_id: row.type_id,
                name: row.name,
                summary: row.summary,
                payload: row.payload,
                tags: row.tags,
                evidence: row.evidence,
                matched_id: row.matched_id,
                fill_payload: row.fill_payload,
                fill_summary: row.fill_summary,
                conflict_action: "merge_alias",
              },
            ],
          });
          message.success(res.data.aliased ? "已合并为别名" : "没有写入别名");
          setInstances((prev) => prev.filter((item) => item._uid !== row._uid));
          setSelectedKeys((prev) => prev.filter((key) => key !== row._uid));
          setCompareRow(null);
          load();
          loadKnowledgeFlag();
          window.dispatchEvent(new Event("pkm-refresh"));
        } catch (err: any) {
          message.error(err?.response?.data?.detail || "合并失败");
        } finally {
          setCommitting(false);
        }
      },
    });
  };

  /**
   * 近名其实是新对象，按新建草稿写入。
   * @param {ExtractedInstance} row
   */
  const commitCreate = (row: ExtractedInstance) => {
    if (!analyzingIds.length) return;
    Modal.confirm({
      title: "仍是新实例",
      content: `确认「${row.name}」与已有知识不是同一条，将新建草稿。`,
      okText: "新建",
      cancelText: "取消",
      onOk: async () => {
        setCommitting(true);
        try {
          const res = await api.post("/api/extract/commit", {
            source_id: analyzingIds[0],
            source_ids: analyzingIds,
            incremental: analyzeMode === "incremental",
            instances: [
              {
                type_id: row.type_id,
                name: row.name,
                summary: row.summary,
                payload: row.payload,
                tags: row.tags,
                evidence: row.evidence,
                conflict_action: "create",
              },
            ],
          });
          message.success(res.data.created ? "已新建草稿" : "没有写入");
          setInstances((prev) => prev.filter((item) => item._uid !== row._uid));
          setSelectedKeys((prev) => prev.filter((key) => key !== row._uid));
          setCompareRow(null);
          load();
          loadKnowledgeFlag();
          window.dispatchEvent(new Event("pkm-refresh"));
        } catch (err: any) {
          message.error(err?.response?.data?.detail || "新建失败");
        } finally {
          setCommitting(false);
        }
      },
    });
  };

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      if (filters.title && !displaySourceTitle(item).includes(filters.title) && !(item.title || "").includes(filters.title)) return false;
      if (filters.source_type && item.source_type !== filters.source_type) return false;
      if (filters.extract_status && (item.extract_status || "none") !== filters.extract_status) return false;
      return true;
    });
  }, [rows, filters]);

  /**
   * 应用筛选。
   */
  const search = () => {
    setFilters({
      title: String(queryForm.getFieldValue("title") || "").trim(),
      source_type: queryForm.getFieldValue("source_type") || "",
      extract_status: queryForm.getFieldValue("extract_status") || "",
    });
  };

  /**
   * 清空条件后立刻重查。
   */
  const reset = () => {
    queryForm.resetFields();
    setFilters({ title: "", source_type: "", extract_status: "" });
  };

  /**
   * 抓取在线文档。
   */
  const fetchUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      message.warning("请粘贴文档链接");
      return;
    }
    setFetching(true);
    try {
      const isJoySpace = connector === "joyspace" || /joyspace\.jd\.com/i.test(trimmed);
      if (isJoySpace && !joySpacePageId(trimmed)) {
        message.error("请粘贴 https://joyspace.jd.com 开头的文档链接");
        return;
      }
      const res = isJoySpace
        ? await ingestJoySpace(trimmed, "")
        : await api.post("/api/sources/fetch", { url: trimmed, connector, target_type_id: "" });
      message.success(
        res.data.status === "ready"
          ? hasKnowledge
            ? "已读取并勾选，可点「更新知识库」"
            : "已读取，可勾选后点「整库分析」"
          : "已提交，请查看抓取结果",
      );
      setUrl("");
      setOnlineOpen(false);
      load();
      window.dispatchEvent(new Event("pkm-refresh"));
      if (res.data?.id) setSelectedRowKeys((prev) => [...new Set([...prev, res.data.id])]);
    } catch (err: any) {
      message.error(apiErrorDetail(err, "读取在线文档失败"));
    } finally {
      setFetching(false);
    }
  };

  /**
   * 浏览器解析本地文件后上传正文。云上 Worker 不能直接收 Word/PDF 二进制。
   * @param {File} file
   */
  const ingestLocalFile = async (file: File) => {
    const payload = await readLocalDocument(file);
    const res = await uploadSourceDocument(payload, "");
    return res.data;
  };

  /**
   * 上传一份或多份本地文档，上传后勾选，由用户点「整库分析」。
   * @param {File[]} files
   */
  const ingestLocalFiles = async (files: File[]) => {
    const list = files.filter((item) => item && item.size >= 0);
    if (!list.length) return;
    setUploading(true);
    const uploadedIds: number[] = [];
    try {
      for (const file of list) {
        try {
          const row = await ingestLocalFile(file);
          if (row?.id) uploadedIds.push(row.id);
        } catch (err: unknown) {
          message.error(`${file.name}：${apiErrorDetail(err, "上传失败")}`);
        }
      }
      load();
      window.dispatchEvent(new Event("pkm-refresh"));
      if (!uploadedIds.length) return;
      setSelectedRowKeys((prev) => [...new Set([...prev, ...uploadedIds])]);
      message.success(
        hasKnowledge
          ? `已导入 ${uploadedIds.length} 份并勾选，可点「更新知识库」只改相关对象`
          : `已导入 ${uploadedIds.length} 份文档并勾选，可点「整库分析」`,
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="先收集多篇资料，再整库分析十大模型"
        description={
          fromTypeName
            ? `你从「${fromTypeName}」过来。这里把多篇资料合在一起分析。专项材料请回到该对象下单独上传。`
            : "一次可上传多份文档。首次用「整库分析」把多篇合在一起抽；知识库有内容后，新文档点「更新知识库」只改相关对象。已经分析过的会打标签。专项材料请到知识治理里单独上传。"
        }
      />
      <div className="pkm-search-stack">
      <QueryForm form={queryForm} onSearch={search} onReset={reset}>
        <Form.Item name="title" label="标题">
          <Input allowClear placeholder="请输入标题" />
        </Form.Item>
        <Form.Item name="source_type" label="来源">
          <Select
            allowClear
            placeholder="全部"
            options={[
              { value: "local", label: SOURCE_KIND.local },
              { value: "feishu", label: SOURCE_KIND.feishu },
              { value: "joyspace", label: SOURCE_KIND.joyspace },
              { value: "web", label: SOURCE_KIND.web },
            ]}
          />
        </Form.Item>
        <Form.Item name="extract_status" label="分析状态">
          <Select
            allowClear
            placeholder="全部"
            options={[
              { value: "none", label: "未分析" },
              { value: "success", label: "已分析" },
              { value: "failed", label: "分析失败" },
            ]}
          />
        </Form.Item>
      </QueryForm>
      <ResultTable
          rowKey="id"
          dataSource={filteredRows}
          onRefresh={load}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as number[]),
            getCheckboxProps: (row: any) => ({ disabled: row.status !== "ready" }),
          }}
          locale={{ emptyText: "还没有资料。请先上传本地文档，或点「在线文档」读取链接。" }}
          operations={
            <>
              <CapAction allowed={canCollect} hint={collectHint}>
                <Upload
                  showUploadList={false}
                  multiple
                  accept={LOCAL_DOC_ACCEPT}
                  disabled={!canCollect || uploading || fetching}
                  beforeUpload={(file, fileList) => {
                    if (file.uid === fileList[0]?.uid) {
                      void ingestLocalFiles(fileList as File[]);
                    }
                    return false;
                  }}
                >
                  <Button loading={uploading} disabled={!canCollect || fetching}>
                    上传文档
                  </Button>
                </Upload>
              </CapAction>
              <CapAction allowed={canCollect} hint={collectHint}>
                <Button disabled={!canCollect || uploading || fetching} onClick={() => setOnlineOpen(true)}>
                  在线文档
                </Button>
              </CapAction>
              <CapAction allowed={canCollect} hint={collectHint}>
                <Button
                  type={hasKnowledge ? "default" : "primary"}
                  disabled={!canCollect || uploading || fetching || !selectedRowKeys.length}
                  onClick={() => {
                    const docs = rows.filter((item) => selectedRowKeys.includes(item.id));
                    confirmAndAnalyze(docs, "corpus");
                  }}
                >
                  整库分析{selectedRowKeys.length ? ` ${selectedRowKeys.length} 篇` : ""}
                </Button>
              </CapAction>
              <CapAction allowed={canCollect} hint={collectHint}>
                <Button
                  type={hasKnowledge ? "primary" : "default"}
                  disabled={!canCollect || uploading || fetching || !selectedRowKeys.length || !hasKnowledge}
                  onClick={() => {
                    const docs = rows.filter((item) => selectedRowKeys.includes(item.id));
                    confirmAndAnalyze(docs, "incremental");
                  }}
                >
                  更新知识库
                </Button>
              </CapAction>
            </>
          }
          columns={[
            { title: "标题", dataIndex: "title", ellipsis: true, render: (_: unknown, r: any) => displaySourceTitle(r) },
            {
              title: "来源",
              key: "origin",
              width: 280,
              ellipsis: true,
              render: (_: unknown, r: any) => {
                const label = sourceOrigin(r);
                if (label === "本地文档") return label;
                return (
                  <a href={label} target="_blank" rel="noreferrer" title={label} onClick={(e) => e.stopPropagation()}>
                    {label}
                  </a>
                );
              },
            },
            {
              title: "正文",
              dataIndex: "status",
              width: 140,
              render: (v, r) => <Tag color={v === "ready" ? "green" : v === "error" ? "red" : "gold"}>{r.error_message || (v === "ready" ? "可分析" : v)}</Tag>,
            },
            {
              title: "分析",
              dataIndex: "extract_status",
              width: 110,
              render: (v, r) => {
                const meta = EXTRACT_META[v] || EXTRACT_META.none;
                if (isAnalyzed(r) && v !== "failed") {
                  return <Tag color="success">已分析</Tag>;
                }
                return <Tag color={meta.color}>{meta.label}</Tag>;
              },
            },
            {
              title: "已写入",
              width: 280,
              render: (_: unknown, r: any) => {
                const coverage = r.coverage || {};
                const types = coverage.types || [];
                if (!types.length) return <span className="pkm-muted">尚未分发</span>;
                return (
                  <Space size={4} wrap>
                    <span>
                      {coverage.instance_count} 条 / {coverage.type_count} 类
                    </span>
                    {types.slice(0, 3).map((item: any) => (
                      <Tag key={item.type_id}>
                        {item.type_name} {item.count}
                      </Tag>
                    ))}
                    {types.length > 3 ? <Tag>+{types.length - 3}</Tag> : null}
                  </Space>
                );
              },
            },
            { title: "创建人", dataIndex: "created_by", width: 90 },
            {
              title: "操作",
              key: "operations",
              hideable: false,
              width: 240,
              render: (_, r) => (
                <Space>
                  <Button type="link" onClick={() => setPreview(r)}>
                    预览
                  </Button>
                  <Button
                    type="link"
                    disabled={r.status !== "ready"}
                    onClick={() =>
                      confirmAndAnalyze([r], !isAnalyzed(r) && hasKnowledge ? "incremental" : "corpus")
                    }
                  >
                    仅此篇
                  </Button>
                  <Button
                    type="link"
                    onClick={async () => {
                      try {
                        await api.post(`/api/sources/${r.id}/refresh`, {}, { timeout: 25000 });
                        message.success("已刷新");
                        load();
                      } catch (err: unknown) {
                        message.error(apiErrorDetail(err, "刷新失败"));
                      }
                    }}
                  >
                    刷新
                  </Button>
                  <Button
                    type="link"
                    danger
                    onClick={async () => {
                      await api.delete(`/api/sources/${r.id}`);
                      setSelectedRowKeys((prev) => prev.filter((id) => id !== r.id));
                      load();
                      window.dispatchEvent(new Event("pkm-refresh"));
                    }}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </div>
      <Modal
        title="读取在线文档"
        open={onlineOpen}
        onCancel={() => !fetching && setOnlineOpen(false)}
        onOk={fetchUrl}
        okText="读取"
        confirmLoading={fetching}
        destroyOnClose
      >
        <p className="pkm-muted" style={{ marginTop: 0 }}>
          {JOYSPACE_URL_HINT} 读取成功后会勾选该文档，再点「整库分析」或「更新知识库」。
        </p>
        <Form layout="vertical">
          <Form.Item label="文档链接" required>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPressEnter={fetchUrl}
              placeholder={JOYSPACE_URL_PLACEHOLDER}
              allowClear
              disabled={fetching}
            />
          </Form.Item>
          <Form.Item label="来源类型">
            <Select
              value={connector}
              onChange={setConnector}
              options={[
                { value: "auto", label: "自动识别" },
                { value: "joyspace", label: "JoySpace" },
                { value: "feishu", label: "飞书" },
                { value: "web", label: "通用网页" },
              ]}
              disabled={fetching}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title={preview?.title} open={!!preview} onCancel={() => setPreview(null)} footer={null} width={800}>
        <pre className="pkm-pre">{preview?.content || "暂无正文"}</pre>
      </Modal>
      <ResizableDrawer
        title={analyzing ? `${analyzeMode === "incremental" ? "增量更新" : "整库分析"} · ${analyzing.title}` : "整库分析"}
        open={!!analyzing}
        onClose={closeAnalyze}
        width={880}
        minWidth={480}
        destroyOnClose
        extra={
          step === 2 ? (
            <Button type="primary" loading={committing} onClick={commitDrafts}>
              {analyzeMode === "incremental" ? `写入 ${selectedInstances.length} 项变更` : `写入 ${selectedInstances.length} 条草稿`}
            </Button>
          ) : null
        }
      >
        <Steps
          size="small"
          current={step}
          style={{ marginBottom: 20 }}
          items={[{ title: "识别覆盖" }, { title: "按对象抽取" }, { title: "确认写入" }, { title: "分发结果" }]}
        />
        {scanning ? (
          <div className="pkm-muted">
            正在识别
            {extractProgress.total > 1 ? ` ${extractProgress.current}/${extractProgress.total} 《${extractProgress.typeName || ""}》` : "文档"}
            ，判断覆盖哪些知识模型、对象类型和实例…
          </div>
        ) : null}
        {scan && step === 0 ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message={`${scan.document_kind || "产品资料"} · ${scan.summary || "已完成识别"}`}
              description={
                analyzeMode === "incremental"
                  ? "增量模式只抽取这些文档点到的对象类型，对照已有知识输出新增、补字段或需比较的变更。"
                  : corpusDocs.length > 1
                    ? `以下是 ${corpusDocs.length} 篇资料合在一起的覆盖。请确认种类和范围后再按对象类型联合抽取。`
                    : "以下是这份文档的覆盖。请确认文档种类、涉及的模型、对象类型和实例后再抽取。"
              }
            />
            <div>
              <div className="pkm-muted" style={{ marginBottom: 6 }}>
                文档种类技能（可改）
              </div>
              <Select
                style={{ width: 280 }}
                value={docKind || undefined}
                placeholder="按扫描结果，也可改选"
                onChange={setDocKind}
                options={documentKinds.map((item: any) => ({ value: item.title, label: item.title }))}
              />
              {(() => {
                const kind =
                  documentKinds.find((item: any) => item.title === docKind || item.key === docKind) ||
                  scan.document_kind_skill;
                if (!kind) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div className="pkm-muted">
                      本类优先模型：{(kind.focus_model_names || []).join("、") || "按文档实际"}
                      {kind.related_type_count ? ` · 关联 ${kind.related_type_count} 个对象类型` : ""}
                      {isAdmin(user) ? (
                        <Button type="link" size="small" onClick={() => navigate(`/skills?kind=${kind.key || ""}`)}>
                          去配置
                        </Button>
                      ) : null}
                    </div>
                    {(kind.related_types || []).slice(0, 12).map((item: any) => (
                      <Tag key={item.type_id}>{item.type_id} {item.name}</Tag>
                    ))}
                    {(kind.related_types || []).length > 12 ? <Tag>等 {kind.related_types.length} 类</Tag> : null}
                  </div>
                );
              })()}
            </div>
            {usedSkills.length ? (
              <div className="pkm-muted">
                识别已用技能：{usedSkills.map((item: any) => item.title).join(" · ")}
              </div>
            ) : null}
            {(scan.skipped_locked_types || []).length ? (
              <Alert
                type="warning"
                showIcon
                message="以下对象类型已锁定，本次分析会跳过"
                description={(scan.skipped_locked_types || []).map((item: any) => `${item.model_name}/${item.type_name}`).join("、")}
              />
            ) : null}
            {(scan.type_hits || []).length ? (
              <Table
                size="small"
                pagination={false}
                rowKey="type_id"
                dataSource={scan.type_hits}
                columns={[
                  { title: "知识模型", dataIndex: "model_name", width: 140 },
                  {
                    title: "对象类型",
                    render: (_: unknown, row: any) => (
                      <span>
                        {row.type_id} {row.type_name || ""}
                        {row.kind_priority ? <Tag color="blue" style={{ marginLeft: 6 }}>本类优先</Tag> : null}
                      </span>
                    ),
                  },
                  {
                    title: "文档中的实例",
                    render: (_: unknown, row: any) => {
                      const names = row.instances || [];
                      if (!names.length) return <span className="pkm-muted">未点出具体实例</span>;
                      return (
                        <Space size={4} wrap>
                          {names.map((item: any) => {
                            const conflict = item.existing_id || (item.similar || []).length;
                            return (
                              <Tag key={item.name} color={item.existing_locked ? "purple" : conflict ? "gold" : "green"}>
                                {item.name}
                                {item.existing_id ? " · 已有" : (item.similar || []).length ? " · 相似" : ""}
                              </Tag>
                            );
                          })}
                        </Space>
                      );
                    },
                  },
                ]}
              />
            ) : null}
            <div>
              <div style={{ marginBottom: 8 }}>抽取范围</div>
              <p className="pkm-muted" style={{ marginBottom: 8 }}>
                {analyzeMode === "incremental"
                  ? "只处理文档覆盖的对象类型，未点名的类型整类跳过。"
                  : "整库分析按勾选模型，对多篇资料覆盖的每一类对象联合抽取。对象详情里上传文档则只抽当前这一类。"}
              </p>
              <Checkbox.Group
                value={modelCodes}
                onChange={(values) => setModelCodes(values.map((item) => Number(item)))}
                options={KNOWLEDGE_MODELS.map((item) => ({
                  value: item.code,
                  label: `${item.name}${scan.model_codes?.includes(item.code) ? "（文档覆盖）" : ""}${
                    scan.locks?.fully_locked_model_codes?.includes(item.code) ? "（已全部锁定）" : ""
                  }`,
                  disabled: scan.locks?.fully_locked_model_codes?.includes(item.code),
                }))}
              />
            </div>
            {corpusDocs.length > 1 ? (
              <div>
                <div className="pkm-muted" style={{ marginBottom: 6 }}>
                  参与分析的文档
                </div>
                <Space size={4} wrap>
                  {corpusDocs.map((item) => (
                    <Tag key={item.id}>{item.title}</Tag>
                  ))}
                </Space>
              </div>
            ) : null}
            <Button type="primary" disabled={!modelCodes.length} onClick={runExtract}>
              {analyzeMode === "incremental" ? "抽取变更" : "按对象抽取"}
            </Button>
          </Space>
        ) : null}
        {extractFailReason ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message={extractFailReason}
            action={
              current?.id ? (
                <Button
                  size="small"
                  onClick={() => {
                    closeAnalyze();
                    navigate(workspacePath(current.id, "/knowledge/1"));
                  }}
                >
                  去手工添加
                </Button>
              ) : null
            }
          />
        ) : null}
        {step >= 1 ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {extracting ? (
              <Progress
                percent={extractProgress.total ? Math.round((extractProgress.current / extractProgress.total) * 100) : 0}
                status="active"
                format={() => {
                  const name = KNOWLEDGE_MODELS.find((item) => item.code === extractProgress.code)?.name || "";
                  const typeName = extractProgress.typeName || "";
                  return `${extractProgress.current}/${extractProgress.total} ${name}${typeName ? ` · ${typeName}` : ""}`;
                }}
              />
            ) : null}
            <Space wrap>
              {modelCodes.map((code) => {
                const state = modelStatus[code] || "wait";
                const label = KNOWLEDGE_MODELS.find((item) => item.code === code)?.name || String(code);
                const color = state === "ok" ? "green" : state === "fail" ? "red" : state === "empty" ? "gold" : state === "run" ? "blue" : "default";
                const text = state === "ok" ? "已抽出" : state === "fail" ? "失败" : state === "empty" ? "无实例" : state === "run" ? "抽取中" : "等待";
                return (
                  <Tag key={code} color={color}>
                    {label} · {text}
                  </Tag>
                );
              })}
            </Space>
            {step === 2 ? (
              <>
                <div className="pkm-muted">
                  {analyzeMode === "incremental"
                    ? "新增和补空字段可勾选后写入。已治理或字段矛盾必须比较。近名可「合并别名」，无变化只挂来源。"
                    : "已按对象类型检索摘录。已有知识不会直接覆盖。近名请合并别名或比较更新。"}
                </div>
                <Space wrap>
                  <Button
                    onClick={() =>
                      setSelectedKeys(
                        instances.filter((item) => BATCH_ACTIONS.has(item.write_action || "")).map((item) => item._uid),
                      )
                    }
                  >
                    写入可批量项
                  </Button>
                  <Button
                    onClick={() =>
                      setSelectedKeys(
                        instances.filter((item) => item.write_action === "create" && !(item.similar || []).length).map((item) => item._uid),
                      )
                    }
                  >
                    只写入全新草稿
                  </Button>
                </Space>
                <Table
                  rowKey="_uid"
                  size="small"
                  dataSource={instances}
                  pagination={false}
                  rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: (keys) => setSelectedKeys(keys as string[]),
                    getCheckboxProps: (row: ExtractedInstance) => ({ disabled: !BATCH_ACTIONS.has(row.write_action || "") }),
                  }}
                  locale={{ emptyText: "没有抽出实例" }}
                  columns={[
                    {
                      title: "模型",
                      width: 120,
                      render: (_: unknown, row: ExtractedInstance) => row.model_name || KNOWLEDGE_MODELS.find((item) => item.code === row.model_code)?.name,
                    },
                    {
                      title: "对象类型",
                      width: 160,
                      render: (_: unknown, row: ExtractedInstance) => `${row.type_id} ${row.type_name || ""}`,
                    },
                    { title: "实例", dataIndex: "name", width: 160 },
                    {
                      title: "处置",
                      width: 160,
                      render: (_: unknown, row: ExtractedInstance) => {
                        const meta = WRITE_ACTION[row.write_action || "create"] || WRITE_ACTION.create;
                        return (
                          <Tag color={meta.color} title={row.write_reason}>
                            {meta.label}
                          </Tag>
                        );
                      },
                    },
                    {
                      title: "变更字段",
                      width: 140,
                      ellipsis: true,
                      render: (_: unknown, row: ExtractedInstance) => (row.changed_keys || []).join("、") || "—",
                    },
                    {
                      title: "矛盾",
                      width: 160,
                      ellipsis: true,
                      render: (_: unknown, row: ExtractedInstance) =>
                        (row.contradictions || []).length
                          ? (row.contradictions || []).map((item) => item.label || item.key).join("、")
                          : "—",
                    },
                    {
                      title: "冲突 / 相似",
                      render: (_: unknown, row: ExtractedInstance) =>
                        (row.similar || []).length
                          ? (row.similar || []).map((item) => `${item.model_name || ""}/${item.type_name || ""}「${item.name}」`).join("；")
                          : "—",
                    },
                    {
                      title: "操作",
                      width: 160,
                      render: (_: unknown, row: ExtractedInstance) =>
                        row.write_action === "compare_update" || row.write_action === "possible_alias" || (row.similar || []).length ? (
                          <Space size={0}>
                            <Button type="link" onClick={() => setCompareRow(row)}>
                              比较更新
                            </Button>
                            {row.write_action === "possible_alias" ? (
                              <>
                                <Button type="link" onClick={() => commitAlias(row)}>
                                  合并别名
                                </Button>
                                <Button type="link" onClick={() => commitCreate(row)}>
                                  仍新建
                                </Button>
                              </>
                            ) : null}
                          </Space>
                        ) : null,
                    },
                  ]}
                />
                <Space>
                  <Button onClick={() => setStep(0)}>返回调整范围</Button>
                  <Button type="primary" loading={committing} disabled={!selectedInstances.length} onClick={commitDrafts}>
                    {analyzeMode === "incremental" ? "写入变更" : "写入待治理草稿"}
                  </Button>
                </Space>
              </>
            ) : null}
            {step === 3 && commitResult ? (
              <>
                <Alert
                  type="success"
                  showIcon
                  message={`已处理 ${(commitResult.coverage?.types || []).length} 个对象类型${
                    commitResult.filled || commitResult.boundOnly
                      ? `（新建 ${commitResult.created || 0} · 补字段 ${commitResult.filled || 0} · 挂来源 ${commitResult.boundOnly || 0}）`
                      : ""
                  }`}
                  description={
                    commitResult.skippedCount
                      ? `另有 ${commitResult.skippedCount} 条需要比较后更新或因锁定未写入。`
                      : "新实例已按类型拆开。已有知识请回到上一步点「比较更新」。"
                  }
                />
                <Table
                  rowKey="type_id"
                  size="small"
                  pagination={false}
                  dataSource={commitResult.coverage?.types || []}
                  columns={[
                    { title: "模型", dataIndex: "model_name", width: 140 },
                    {
                      title: "对象类型",
                      render: (_: unknown, row: any) => `${row.type_id} ${row.type_name}`,
                    },
                    { title: "写入条数", dataIndex: "count", width: 100 },
                    {
                      title: "",
                      width: 100,
                      render: (_: unknown, row: any) => (
                        <Button
                          type="link"
                          onClick={() => {
                            closeAnalyze();
                            navigate(`${base}/knowledge/${row.model_code || 1}?type=${encodeURIComponent(row.type_id)}`);
                          }}
                        >
                          去治理
                        </Button>
                      ),
                    },
                  ]}
                />
                <Space>
                  <Button onClick={closeAnalyze}>继续收集</Button>
                  <Button
                    type="primary"
                    onClick={() => {
                      const first = (commitResult.coverage?.types || [])[0];
                      closeAnalyze();
                      if (first) {
                        navigate(`${base}/knowledge/${first.model_code || 1}?type=${encodeURIComponent(first.type_id)}`);
                      }
                    }}
                  >
                    从第一个类型开始治理
                  </Button>
                </Space>
              </>
            ) : null}
          </Space>
        ) : null}
      </ResizableDrawer>
      <ExtractCompareModal
        open={!!compareRow}
        row={compareRow}
        sourceId={analyzingIds[0]}
        sourceIds={analyzingIds}
        incremental={analyzeMode === "incremental"}
        onClose={() => setCompareRow(null)}
        onDone={() => {
          if (compareRow) {
            setInstances((prev) => prev.filter((item) => item._uid !== compareRow._uid));
            setSelectedKeys((prev) => prev.filter((key) => key !== compareRow._uid));
          }
          load();
          loadKnowledgeFlag();
        }}
        onMergeAlias={compareRow ? () => commitAlias(compareRow) : undefined}
        onCreateNew={compareRow ? () => commitCreate(compareRow) : undefined}
      />
    </div>
  );
}
