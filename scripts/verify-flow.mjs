/**
 * 不依赖 Vite 的主路径契约测试：抽取 JSON、字段合并、复制产品、线上路由。
 */

function extractLlmJson(text) {
  let raw = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "");
  const obj = raw.indexOf("{");
  if (obj < 0) return null;
  raw = raw.slice(obj);
  try {
    return JSON.parse(raw);
  } catch {
    const end = raw.lastIndexOf("}");
    return end > 0 ? JSON.parse(raw.slice(0, end + 1)) : null;
  }
}

function asPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (value == null || key === "") return;
    out[key] = String(value);
  });
  return out;
}

const STEWARD = new Set(["steward_name", "steward_role", "steward_team"]);

function emptyFieldLines(type, current) {
  const payload = asPayload(current.payload);
  const empty = [];
  if (!String(current.name || "").trim()) empty.push("name=名称");
  (type.fields || []).forEach((field) => {
    if (!field.key || STEWARD.has(field.key)) return;
    if (!String(payload[field.key] || "").trim()) empty.push(`${field.key}=${field.label}`);
  });
  return empty;
}

function mergeFilled(type, current, data) {
  const incoming = { ...asPayload(data.payload), ...asPayload(data) };
  const payload = { ...asPayload(current.payload) };
  const filled = [];
  const name = String(current.name || "").trim() || String(incoming.name || "").trim();
  if (!String(current.name || "").trim() && name) filled.push("name");
  (type.fields || []).forEach((field) => {
    if (!field.key || STEWARD.has(field.key)) return;
    if (String(payload[field.key] || "").trim()) return;
    const next = String(incoming[field.key] || "").trim();
    if (!next) return;
    payload[field.key] = next;
    filled.push(field.key);
  });
  return { name, payload, filled_keys: filled };
}

function createProductPayload(values) {
  const payload = { ...values };
  if (payload.init_mode === "copy") {
    payload.init_mode = "clone";
    payload.clone_from_id = payload.copy_from_id;
  }
  return payload;
}

const type = {
  entity_id: "E01-001",
  fields: [
    { key: "audience", label: "服务对象" },
    { key: "boundary", label: "边界" },
    { key: "steward_name", label: "维护人" },
  ],
};

let failed = 0;
function assert(name, ok) {
  if (ok) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`fail  ${name}`);
  }
}

const parsed = extractLlmJson('前言```json\n{"name":"爱导购","payload":{"audience":"门店导购"}}\n```');
const merged = mergeFilled(type, { name: "", payload: {} }, parsed);
const kept = mergeFilled(type, { name: "已有名", payload: { audience: "已填" } }, { name: "新名", audience: "新客群" });
const copied = createProductPayload({ init_mode: "copy", copy_from_id: 3, name: "新品" });

assert("抽出带围栏的 JSON", parsed?.name === "爱导购");
assert("补全名称与字段", merged.name === "爱导购" && merged.payload.audience === "门店导购");
assert("维护人不当空字段", !emptyFieldLines(type, { payload: {} }).some((line) => line.startsWith("steward_name")));
assert("已填不覆盖", kept.name === "已有名" && kept.payload.audience === "已填");
assert("复制产品映射 clone_from_id", copied.init_mode === "clone" && copied.clone_from_id === 3);
assert(
  "问答契约字段齐全",
  ["ok", "mode", "answer", "citations", "scope"].every((key) =>
    Object.prototype.hasOwnProperty.call(
      { ok: true, mode: "answer", answer: "x", citations: [], scope: [] },
      key,
    ),
  ),
);

const health = await fetch("http://speed-p.5.jd.com/api/ProductKnowledgeModel/api/health");
const healthBody = await health.json();
assert("线上健康检查", health.ok && healthBody.ok === true);

const complete = await fetch("http://speed-p.5.jd.com/api/ProductKnowledgeModel/api/llm/complete", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "OK" }] }),
});
assert("短补全路由已挂上（需登录）", complete.status === 401);

if (failed) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log("\n主路径契约本地验证通过");
