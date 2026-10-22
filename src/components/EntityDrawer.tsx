import { Alert, Button, Card, Descriptions, Form, Input, Popconfirm, Select, Space, Spin, Tag, Upload, message } from "antd";
import ResizableDrawer from "./ResizableDrawer";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiErrorDetail, asList, asPayload, Entity, ingestJoySpace, isLlmQuotaBlocked, isLlmUnavailableError, JOYSPACE_URL_HINT, JOYSPACE_URL_PLACEHOLDER, joySpacePageId, KnowledgeType, llmBlockedReason, llmUnavailableReason, parseEntityDetail } from "../api";
import { fillFieldsFromText, sourceText } from "../llmExtract";
import { canMutate, canWriteProduct, hasCap, useAuth } from "../auth";
import { governanceGaps } from "../governanceReady";
import { useProduct } from "../product";
import { LOCAL_DOC_ACCEPT, readLocalDocument } from "../localDoc";
import { KnowledgeSnapshot, snapshotFromEntity } from "../knowledgeCompare";
import type { EntityMode } from "../workspace";
import FieldTableInput from "./FieldTableInput";
import GovernanceTag from "./GovernanceTag";
import KnowledgeCompare from "./KnowledgeCompare";

interface Props {
  open: boolean;
  mode: EntityMode;
  id?: number;
  typeId?: string;
  onClose: () => void;
  onModeChange: (mode: EntityMode) => void;
  onOpenSource?: (typeId: string, entityId?: number) => void;
}

/**
 * 知识实例抽屉：新建与治理默认直接填写；需要时再切到左右对照。
 */
export default function EntityDrawer({ open, mode, id, typeId, onClose, onModeChange, onOpenSource }: Props) {
  const [form] = Form.useForm();
  const { user } = useAuth();
  const { current: currentProduct } = useProduct();
  const writable = canWriteProduct(user, currentProduct);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [typeMeta, setTypeMeta] = useState<KnowledgeType | null>(null);
  const [refOptions, setRefOptions] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [fillText, setFillText] = useState("");
  const [fillFailReason, setFillFailReason] = useState("");
  const [joyUrl, setJoyUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedDone, setSavedDone] = useState(false);
  const [governedDone, setGovernedDone] = useState(false);
  const [persisted, setPersisted] = useState<Entity | null>(null);
  const [saved, setSaved] = useState<KnowledgeSnapshot | null>(null);
  const [proposed, setProposed] = useState<KnowledgeSnapshot | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const hydrating = useRef(false);
  const isCreate = mode === "create";
  const isEdit = mode === "edit";
  const current = persisted || entity;
  const frozen = !!(current?.locked);
  const formValues = Form.useWatch([], form);
  const createGaps = useMemo(() => governanceGaps(typeMeta, formValues || {}), [typeMeta, formValues]);
  const editGaps = useMemo(
    () =>
      governanceGaps(typeMeta, {
        name: proposed?.name,
        summary: proposed?.summary,
        ...(proposed?.payload || {}),
      }),
    [typeMeta, proposed],
  );
  const canEditRecord = writable && canMutate(user, entity?.created_by, "entity_edit_own", "entity_edit_others");
  const canCreate = writable && hasCap(user, "entity_create");
  const canDelete = writable && canMutate(user, entity?.created_by, "entity_delete_own", "entity_delete_others");
  const gaps = isEdit && compareMode ? editGaps : createGaps;
  const showDirectForm = (isCreate && canCreate) || (isEdit && !frozen && canEditRecord && !compareMode);
  const showCompare = isEdit && !frozen && canEditRecord && compareMode && !!saved && !!proposed && !!current;

  /**
   * 把实例填进表单。
   * @param {Entity} row
   * @param {KnowledgeType} type
   */
  const fillForm = (row: Entity, type: KnowledgeType) => {
    const values: Record<string, unknown> = {
      name: row.name,
      summary: row.summary,
      status: row.status,
      tags: row.tags,
      refs: (row.refs || []).filter((item) => item.to_id).map((item) => item.to_id),
      steward_name: user?.username || row.steward_name || row.updated_by || "",
    };
    type.fields.forEach((field) => {
      if (["steward_name", "steward_role", "steward_team"].includes(field.key)) return;
      values[field.key] = asPayload(row.payload)[field.key] || "";
    });
    if (!type.fields.some((field) => field.key === "aliases")) {
      values.aliases = asPayload(row.payload).aliases || "";
    }
    hydrating.current = true;
    form.setFieldsValue(values);
    hydrating.current = false;
    setDirty(false);
    setSavedDone(true);
    setGovernedDone(row.stage === "governed");
    const snap = snapshotFromEntity(row);
    setSaved(snap);
    setProposed(snap);
  };

  /**
   * 从表单收成对照快照，切到左右对照时用。
   * @returns {KnowledgeSnapshot | null}
   */
  const snapshotFromForm = (): KnowledgeSnapshot | null => {
    if (!typeMeta) return null;
    const values = form.getFieldsValue();
    const payload: Record<string, string> = {};
    typeMeta.fields.forEach((field) => {
      if (["steward_name", "steward_role", "steward_team"].includes(field.key)) return;
      payload[field.key] = values[field.key] || "";
    });
    if (!typeMeta.fields.some((field) => field.key === "aliases")) payload.aliases = values.aliases || "";
    return {
      name: values.name || "",
      summary: values.summary || "",
      payload,
      tags: values.tags || [],
    };
  };

  /**
   * 把对照右侧写回填写表单。
   * @param {KnowledgeSnapshot} snap
   */
  const applySnapshotToForm = (snap: KnowledgeSnapshot) => {
    hydrating.current = true;
    form.setFieldsValue({
      name: snap.name,
      summary: snap.summary,
      tags: snap.tags,
      ...snap.payload,
    });
    hydrating.current = false;
  };

  /**
   * 直接填写 ↔ 左右对照。切换时把当前编辑内容带过去。
   */
  const toggleCompare = () => {
    if (!compareMode) {
      const snap = snapshotFromForm();
      if (snap) setProposed(snap);
      setCompareMode(true);
      return;
    }
    if (proposed) applySnapshotToForm(proposed);
    setCompareMode(false);
  };

  useEffect(() => {
    if (!open) {
      setEntity(null);
      setTypeMeta(null);
      setLoadError("");
      setFillText("");
      setJoyUrl("");
      setPersisted(null);
      setDirty(false);
      setSavedDone(false);
      setGovernedDone(false);
      setSaved(null);
      setProposed(null);
      setCompareMode(false);
      return;
    }
    let cancelled = false;
    const boot = async () => {
      setLoading(true);
      setLoadError("");
      setFillFailReason("");
      setFillText("");
      setJoyUrl("");
      setCompareMode(false);
      try {
        if (!isCreate && id) {
          const res = await api.get(`/api/entities/${id}`);
          const parsed = parseEntityDetail(res.data);
          if (!parsed.entity) {
            throw new Error("实例不存在");
          }
          let type = parsed.type;
          if (!type?.fields?.length) {
            const types = await api.get("/api/meta/types");
            type = asList<KnowledgeType>(types.data).find((item) => item.entity_id === parsed.entity?.type_id);
          }
          if (cancelled) return;
          setEntity(parsed.entity);
          setTypeMeta(type || null);
          if (type) fillForm(parsed.entity, type);
        } else if (typeId) {
          const types = await api.get("/api/meta/types");
          const type = asList<KnowledgeType>(types.data).find((item) => item.entity_id === typeId) || null;
          if (cancelled) return;
          setTypeMeta(type);
          setEntity(null);
          form.resetFields();
          form.setFieldsValue({
            tags: type?.tags || [],
            steward_name: user?.username || "",
          });
          setDirty(false);
          setSavedDone(false);
          setGovernedDone(false);
          setSaved(null);
          setProposed(null);
        }
        if (isCreate || isEdit) {
          const refs = await api.get("/api/entities");
          if (!cancelled) setRefOptions(asList<Entity>(refs.data));
        }
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorDetail(err, "加载失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, [open, mode, id, typeId]);

  const title = typeMeta
    ? `${isCreate ? "新建" : isEdit && !frozen ? (compareMode ? "对照治理" : "治理") : "查看"} · ${typeMeta.model_name} / ${typeMeta.name}`
    : "知识实例";
  const allowedRefs = refOptions.filter((item) => !typeMeta?.ref_type_ids?.length || typeMeta.ref_type_ids.includes(item.type_id));

  /**
   * 写入实例。publish 为真时记为已治理。
   * @param {boolean} publish
   */
  const persist = async (publish: boolean) => {
    if (!typeMeta) return;
    const values = form.getFieldsValue();
    const payload: Record<string, string> = {};
    typeMeta.fields.forEach((field) => {
      if (["steward_name", "steward_role", "steward_team"].includes(field.key)) return;
      payload[field.key] = values[field.key] || "";
    });
    if (!typeMeta.fields.some((field) => field.key === "aliases")) payload.aliases = values.aliases || "";
    const body = {
      type_id: typeMeta.entity_id,
      name: values.name,
      summary: values.summary,
      status: publish ? "published" : "draft",
      tags: values.tags || [],
      payload,
      origin: current?.origin || "manual",
      refs: (values.refs || []).map((to_id: number) => ({ to_id, relation: "引用" })),
      steward_name: user?.username || "",
      steward_role: "",
      steward_team: "",
    };
    setSaving(true);
    try {
      let next = current;
      if (!current) {
        const res = await api.post("/api/entities", { ...body, change_note: publish ? "治理" : "创建" });
        next = parseEntityDetail(res.data).entity || (res.data.entity as Entity);
      } else {
        const res = await api.put(`/api/entities/${current.id}`, {
          ...body,
          version: current.version,
          change_note: publish ? "治理" : "保存",
        });
        next = parseEntityDetail(res.data).entity || res.data.entity || { ...current, ...body, stage: publish ? "governed" : current.stage };
      }
      if (next) {
        setEntity(next);
        setPersisted(next);
        if (typeMeta) fillForm(next, typeMeta);
        setGovernedDone(publish || next.stage === "governed");
      }
      setDirty(false);
      setSavedDone(true);
      message.success(publish ? "已治理" : "已保存");
      window.dispatchEvent(new Event("pkm-refresh"));
    } catch (err) {
      message.error(apiErrorDetail(err, publish ? "治理失败" : "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  /**
   * 把对照结果写成新版本。右侧正在改的内容整体写入，并记版本。
   * @param {KnowledgeSnapshot} merged
   * @param {string} note
   * @param {boolean} [publish]
   */
  const applyMerged = async (merged: KnowledgeSnapshot, note: string, publish = false) => {
    if (!current || !typeMeta) return;
    const extra = form.getFieldsValue();
    setSaving(true);
    try {
      const res = await api.put(`/api/entities/${current.id}`, {
        type_id: typeMeta.entity_id,
        name: merged.name,
        summary: merged.summary,
        status: publish ? "published" : "draft",
        tags: merged.tags,
        payload: merged.payload,
        origin: current.origin || "manual",
        version: current.version,
        refs: (extra.refs || []).map((to_id: number) => ({ to_id, relation: "引用" })),
        change_note: note,
        steward_name: user?.username || "",
        steward_role: "",
        steward_team: "",
      });
      const next = parseEntityDetail(res.data).entity || res.data.entity || current;
      setEntity(next);
      setPersisted(next);
      if (typeMeta) fillForm(next, typeMeta);
      setGovernedDone(publish || next.stage === "governed");
      setDirty(false);
      setSavedDone(true);
      message.success(publish ? "已治理" : "已保存");
      window.dispatchEvent(new Event("pkm-refresh"));
    } catch (err) {
      message.error(apiErrorDetail(err, publish ? "治理失败" : "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  /**
   * 点击治理：内容不齐时提示缺项。
   */
  const tryGovern = () => {
    if (!gaps.ready) {
      message.warning(gaps.hint || "内容不完整，请先补全必填后再治理");
      return;
    }
    if (isEdit && compareMode && proposed) {
      void applyMerged(proposed, "治理", true);
      return;
    }
    void persist(true);
  };

  /**
   * 用文档或粘贴正文补全当前表单空字段，已填内容不覆盖。
   * @param {string} text
   */
  const fillFromText = async (text: string) => {
    if (!typeMeta) return;
    const clipped = String(text || "").trim();
    if (!clipped) {
      message.warning("请先上传文档或粘贴正文");
      return;
    }
    const fromProposed = isEdit && compareMode && proposed;
    const values = fromProposed
      ? { name: proposed.name, summary: proposed.summary, payload: proposed.payload }
      : form.getFieldsValue();
    const currentPayload: Record<string, string> = {};
    typeMeta.fields.forEach((field) => {
      if (["steward_name", "steward_role", "steward_team"].includes(field.key)) return;
      currentPayload[field.key] = fromProposed ? proposed.payload[field.key] || "" : values[field.key] || "";
    });
    if (!typeMeta.fields.some((field) => field.key === "aliases")) {
      currentPayload.aliases = fromProposed ? proposed.payload.aliases || "" : values.aliases || "";
    }
    setFilling(true);
    setFillFailReason("");
    try {
      const next = await fillFieldsFromText(typeMeta, clipped, {
        name: values.name || "",
        summary: values.summary || "",
        payload: currentPayload,
      });
      if (fromProposed) {
        setProposed({
          ...proposed,
          name: next.name || proposed.name,
          summary: next.summary || proposed.summary,
          payload: { ...proposed.payload, ...next.payload },
          tags: proposed.tags,
        });
        setDirty(true);
        setSavedDone(false);
        setGovernedDone(false);
      } else {
        form.setFieldsValue({
          name: next.name || values.name,
          summary: next.summary || values.summary,
          ...next.payload,
        });
      }
      const filled = next.filled_keys.length;
      message.success(filled ? `已请 AI 归纳填写 ${filled} 个字段，请核对后保存` : "没有可补的空字段");
    } catch (err) {
      const reason = isLlmUnavailableError(err) ? llmUnavailableReason(err) : apiErrorDetail(err, "识别失败");
      setFillFailReason(reason);
      message.error(reason);
    } finally {
      setFilling(false);
    }
  };

  /**
   * 从 JoySpace 链接读取正文并补全空字段。
   */
  const fillFromJoySpace = async () => {
    const trimmed = joyUrl.trim();
    if (!joySpacePageId(trimmed)) {
      message.error("请粘贴 https://joyspace.jd.com 开头的文档链接");
      return;
    }
    if (!typeMeta) return;
    setFilling(true);
    setFillFailReason("");
    let text = "";
    try {
      const res = await ingestJoySpace(trimmed, typeMeta.entity_id);
      text = (await sourceText(res.data)) || String(res.data?.content || "");
      setFillText(text);
      setJoyUrl("");
    } catch (err) {
      const reason = isLlmUnavailableError(err) ? llmUnavailableReason(err) : apiErrorDetail(err, "读取 JoySpace 失败");
      setFillFailReason(reason);
      message.error(reason);
      return;
    } finally {
      setFilling(false);
    }
    await fillFromText(text);
  };

  /**
   * 删除当前实例。
   */
  const removeEntity = async () => {
    if (!entity) return;
    await api.delete(`/api/entities/${entity.id}`);
    message.success("已删除");
    window.dispatchEvent(new Event("pkm-refresh"));
    onClose();
  };

  return (
    <ResizableDrawer
      title={title}
      open={open}
      onClose={onClose}
      width={showCompare ? 1080 : 720}
      minWidth={420}
      destroyOnClose
      maskClosable={false}
      keyboard={false}
      extra={
        (isEdit && !frozen && canEditRecord) || (isCreate && typeMeta) ? (
          <Space>
            {isEdit && !frozen && canEditRecord ? (
              <Button onClick={toggleCompare}>{compareMode ? "直接填写" : "对照修改"}</Button>
            ) : null}
            {isCreate && typeMeta ? (
              <Button
                onClick={() => {
                  onOpenSource?.(typeMeta.entity_id);
                  onClose();
                }}
              >
                从文档写入
              </Button>
            ) : null}
          </Space>
        ) : null
      }
    >
      {loading ? <Spin /> : null}
      {loadError ? <Alert type="error" showIcon message={loadError} /> : null}

      {!loading && !loadError && !isCreate && entity && typeMeta && (!isEdit || frozen || !canEditRecord) ? (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <GovernanceTag stage={entity.stage} completeness={entity.completeness} />
            {entity.locked ? <Tag color="purple">已锁定</Tag> : null}
          </Space>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="名称">{entity.name}</Descriptions.Item>
            <Descriptions.Item label="摘要">{entity.summary || "-"}</Descriptions.Item>
            {!typeMeta.fields.some((field) => field.key === "aliases") ? (
              <Descriptions.Item label="别名">{asPayload(entity.payload).aliases || "-"}</Descriptions.Item>
            ) : null}
            {typeMeta.fields.map((field) => (
              <Descriptions.Item key={field.key} label={field.label}>
                {asPayload(entity.payload)[field.key] || <span className="pkm-empty">未填</span>}
              </Descriptions.Item>
            ))}
            <Descriptions.Item label="维护人">{entity.steward_name || entity.updated_by || "-"}</Descriptions.Item>
          </Descriptions>
          <Space style={{ marginTop: 16 }}>
            {canEditRecord ? (
              entity.locked ? (
                <Button
                  type="primary"
                  onClick={async () => {
                    const res = await api.post(`/api/entities/${entity.id}/lock`, { locked: false });
                    const parsed = parseEntityDetail(res.data);
                    setEntity(parsed.entity || { ...entity, locked: false });
                    message.success("已解锁");
                  }}
                >
                  解锁后治理
                </Button>
              ) : (
                <Button type="primary" onClick={() => onModeChange("edit")}>
                  治理
                </Button>
              )
            ) : null}
          </Space>
        </>
      ) : null}

      {!loading && !loadError && showCompare && typeMeta && saved && proposed && current ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="左边是已保存内容，右边是正在改的内容。保存或治理会把右侧写入新版本，不会在未确认时覆盖已有知识。"
          />
          <Card size="small" title="用文档补全右侧空字段">
            <p className="pkm-muted" style={{ marginTop: 0 }}>
              只填右侧空项，已保存和已改的内容不覆盖。额度用尽时文档仍可读取，但不会自动填字段。
            </p>
            {fillFailReason || isLlmQuotaBlocked() ? (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={fillFailReason || llmBlockedReason()} />
            ) : null}
            <Upload
              showUploadList={false}
              accept={LOCAL_DOC_ACCEPT}
              disabled={filling}
              customRequest={async ({ file, onSuccess, onError }) => {
                try {
                  const payload = await readLocalDocument(file as File);
                  setFillText(payload.content || "");
                  onSuccess && onSuccess({}, new XMLHttpRequest());
                  await fillFromText(payload.content || "");
                } catch (err) {
                  message.error(apiErrorDetail(err, "文档解析失败"));
                  onError && onError(err as Error);
                }
              }}
            >
              <Button loading={filling}>上传文档识别</Button>
            </Upload>
            <Space.Compact style={{ width: "100%", marginTop: 8 }}>
              <Input
                value={joyUrl}
                onChange={(e) => setJoyUrl(e.target.value)}
                onPressEnter={fillFromJoySpace}
                placeholder={JOYSPACE_URL_PLACEHOLDER}
                disabled={filling}
                allowClear
              />
              <Button type="primary" loading={filling} onClick={fillFromJoySpace}>
                读取
              </Button>
            </Space.Compact>
            <Button style={{ marginTop: 8 }} loading={filling} onClick={() => fillFromText(fillText)}>
              识别并补全空字段
            </Button>
            <Input.TextArea
              rows={2}
              style={{ marginTop: 8 }}
              value={fillText}
              onChange={(event) => setFillText(event.target.value)}
              placeholder="或粘贴正文后点「识别并补全空字段」"
            />
          </Card>
          <KnowledgeCompare
            typeMeta={typeMeta}
            current={saved}
            proposed={proposed}
            mode="edit"
            leftTitle="现有已保存"
            rightTitle="正在修改"
            locked={frozen}
            published={current.stage === "governed" || current.status === "published"}
            applying={saving}
            hideActions
            onProposedChange={(next) => {
              setProposed(next);
              setDirty(true);
              setSavedDone(false);
              setGovernedDone(false);
            }}
            onApply={(merged, note) => applyMerged(merged, note)}
            onKeep={onClose}
          />
          <Form form={form} layout="vertical">
            <Form.Item name="steward_name" label="维护人" extra="取 SSO 登录账号，保存后记为最后修改人">
              <Input disabled placeholder={user?.username || ""} />
            </Form.Item>
            <Form.Item name="refs" label="引用其他知识">
              <Select
                mode="multiple"
                allowClear
                optionFilterProp="label"
                options={allowedRefs.map((item) => ({
                  value: item.id,
                  label: `${item.type_id} ${item.type_name} · ${item.name}`,
                }))}
              />
            </Form.Item>
          </Form>
          {!editGaps.ready ? <Alert type="warning" showIcon message={editGaps.hint} /> : null}
          <Space wrap>
            {current && !current.locked && canDelete ? (
              <Popconfirm title="确认删除这条知识？" onConfirm={removeEntity}>
                <Button danger>删除</Button>
              </Popconfirm>
            ) : null}
            <Button onClick={onClose}>取消</Button>
            <Button
              disabled={savedDone && !dirty}
              loading={saving}
              onClick={() => proposed && applyMerged(proposed, "保存", false)}
            >
              {savedDone && !dirty ? "已保存" : "保存"}
            </Button>
            <span
              onClick={() => {
                if (!editGaps.ready && !(governedDone && !dirty)) {
                  message.warning(editGaps.hint || "内容不完整，请先补全必填后再治理");
                }
              }}
            >
              <Button
                type="primary"
                disabled={!editGaps.ready || (governedDone && !dirty)}
                loading={saving}
                onClick={tryGovern}
              >
                {governedDone && !dirty ? "已治理" : "治理"}
              </Button>
            </span>
          </Space>
        </Space>
      ) : null}

      {!loading && !loadError && typeMeta && showDirectForm ? (
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => {
            if (hydrating.current) return;
            setDirty(true);
            setSavedDone(false);
            setGovernedDone(false);
          }}
        >
          <Card size="small" title="用文档补全空字段" style={{ marginBottom: 16 }}>
            <p className="pkm-muted" style={{ marginTop: 0 }}>
              可上传本地文件，或粘贴 JoySpace 文档链接（使用当前登录身份读取）。大模型可用时才会归纳填写；额度用尽或配置不正确时文档仍可读取，但不会自动填字段。
            </p>
            {fillFailReason || isLlmQuotaBlocked() ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message={fillFailReason || llmBlockedReason()}
              />
            ) : null}
            <div style={{ marginBottom: 8 }}>
              <div className="pkm-muted" style={{ marginBottom: 8 }}>本地文件</div>
              <Upload
                showUploadList={false}
                accept={LOCAL_DOC_ACCEPT}
                disabled={filling}
                customRequest={async ({ file, onSuccess, onError }) => {
                  try {
                    const payload = await readLocalDocument(file as File);
                    setFillText(payload.content || "");
                    onSuccess && onSuccess({}, new XMLHttpRequest());
                    await fillFromText(payload.content || "");
                  } catch (err) {
                    message.error(apiErrorDetail(err, "文档解析失败"));
                    onError && onError(err as Error);
                  }
                }}
              >
                <Button loading={filling}>上传文档识别</Button>
              </Upload>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div className="pkm-muted" style={{ marginBottom: 8 }}>JoySpace 在线文档</div>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  value={joyUrl}
                  onChange={(e) => setJoyUrl(e.target.value)}
                  onPressEnter={fillFromJoySpace}
                  placeholder={JOYSPACE_URL_PLACEHOLDER}
                  disabled={filling}
                  allowClear
                />
                <Button type="primary" loading={filling} onClick={fillFromJoySpace}>
                  读取
                </Button>
              </Space.Compact>
              <div className="pkm-muted" style={{ marginTop: 8 }}>
                {JOYSPACE_URL_HINT}
              </div>
            </div>
            <Space wrap style={{ marginBottom: 8 }}>
              <Button loading={filling} onClick={() => fillFromText(fillText)}>
                识别并补全空字段
              </Button>
            </Space>
            <Input.TextArea
              rows={3}
              value={fillText}
              onChange={(event) => setFillText(event.target.value)}
              placeholder="或粘贴正文后点「识别并补全空字段」"
            />
          </Card>
          <Form.Item name="name" label="名称" rules={[{ required: true, min: 2, message: "请填写名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="摘要">
            <Input.TextArea rows={2} />
          </Form.Item>
          {!typeMeta.fields.some((field) => field.key === "aliases") ? (
            <Form.Item name="aliases" label="别名" extra="其他叫法，逗号或顿号分隔。合并近名时会自动写入。">
              <Input placeholder="如：店内立减、门店优惠" />
            </Form.Item>
          ) : null}
          <Form.Item
            name="steward_name"
            label="维护人"
            extra="取 SSO 登录账号，保存后记为最后修改人"
          >
            <Input disabled placeholder={user?.username || ""} />
          </Form.Item>
          {typeMeta.fields.map((field) => (
            <Form.Item
              key={field.key}
              name={field.key}
              label={field.label}
              extra={field.fill_hint}
              rules={field.required ? [{ required: true, min: 2, message: "请填写有效内容" }] : []}
            >
              {field.type === "select" ? (
                <Select options={(field.options || []).map((item) => ({ label: item, value: item }))} allowClear />
              ) : field.type === "text" ? (
                <Input />
              ) : field.type === "table" ? (
                <FieldTableInput columns={field.options || []} />
              ) : (
                <Input.TextArea rows={3} />
              )}
            </Form.Item>
          ))}
          <Form.Item name="refs" label="引用其他知识">
            <Select
              mode="multiple"
              allowClear
              optionFilterProp="label"
              options={allowedRefs.map((item) => ({ value: item.id, label: `${item.type_id} ${item.type_name} · ${item.name}` }))}
            />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" />
          </Form.Item>
          {!gaps.ready ? <Alert type="warning" showIcon message={gaps.hint} style={{ marginBottom: 12 }} /> : null}
          <Space>
            {current && !current.locked && canDelete ? (
              <Popconfirm title="确认删除这条知识？" onConfirm={removeEntity}>
                <Button danger>删除</Button>
              </Popconfirm>
            ) : null}
            <Button onClick={onClose}>取消</Button>
            <Button disabled={savedDone && !dirty} loading={saving && !governedDone} onClick={() => void persist(false)}>
              {savedDone && !dirty ? "已保存" : "保存"}
            </Button>
            <span
              onClick={() => {
                if (!gaps.ready && !(governedDone && !dirty)) tryGovern();
              }}
            >
              <Button
                type="primary"
                disabled={!gaps.ready || (governedDone && !dirty)}
                loading={saving}
                onClick={tryGovern}
              >
                {governedDone && !dirty ? "已治理" : "治理"}
              </Button>
            </span>
          </Space>
        </Form>
      ) : null}

      {!loading && !loadError && !typeMeta && !entity ? (
        <Alert type="info" showIcon message="请先在左侧选择对象类型，再点「新建」。" />
      ) : null}
    </ResizableDrawer>
  );
}
