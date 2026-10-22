/**
 * 总览页 PDF 表格（无冒号）应对齐到产品定位字段，且不能把邻格原文堆进当前格子。
 */
const type = {
  name: "产品定位",
  fields: [
    { key: "source", label: "来源", type: "text" },
    { key: "source_version", label: "来源版本", type: "text" },
    { key: "effective_to", label: "失效时间", type: "text" },
    { key: "owner_module", label: "所属模块", type: "text" },
    { key: "identity", label: "产品是什么", required: true, type: "textarea" },
    { key: "target_users", label: "产品服务谁", required: true, type: "textarea" },
    { key: "problems", label: "产品解决什么问题", required: true, type: "textarea" },
    { key: "core_scenarios", label: "核心场景摘要", type: "textarea" },
    { key: "core_value", label: "产品核心价值", required: true, type: "textarea" },
    { key: "value_proposition", label: "核心价值主张", type: "textarea" },
  ],
};

const coreType = {
  name: "核心对象",
  fields: [
    { key: "effective_to", label: "失效时间", type: "text" },
    { key: "object_name", label: "对象名称", type: "text" },
    { key: "meaning", label: "含义", type: "textarea" },
  ],
};

const META_KEYS = new Set(["source", "source_version", "effective_from", "effective_to", "owner_module"]);
const CELL_STOPS = [
  "一、",
  "二、",
  "三、",
  "最后更新时间",
  "产品简称",
  "所属业务",
  "产品负责人",
  "名称",
  "摘要",
  "来源版本",
  "生效时间",
  "失效时间",
  "所属模块",
  "来源",
  "产品是什么",
  "产品服务谁",
  "产品解决什么问题",
  "核心场景摘要",
  "产品核心价值",
  "核心价值主张",
  "对象名称",
  "对象类型",
  "含义",
  "基本关系",
];

function escapeReg(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cutAtStops(value, stops) {
  let next = String(value || "");
  stops.forEach((stop) => {
    const lineAt = next.search(new RegExp(`(?:^|\\n)\\s*${escapeReg(stop)}(?:\\s|$|[:：])`));
    if (lineAt > 0) next = next.slice(0, lineAt).trim();
    const inlineAt = next.search(new RegExp(`\\s+${escapeReg(stop)}(?:\\s|$|[:：])`));
    if (inlineAt > 0) next = next.slice(0, inlineAt).trim();
  });
  return next.trim();
}

function boundCellValue(value, key, field) {
  const skip = new Set([key, field?.label, key === "name" ? "名称" : ""].filter(Boolean));
  let next = cutAtStops(String(value || "").trim(), CELL_STOPS.filter((stop) => !skip.has(stop)));
  const kind = field?.type || (key === "name" || META_KEYS.has(key) ? "text" : "textarea");
  if (key === "name") return next.split(/\n/)[0].trim();
  if (key === "effective_from" || key === "effective_to") {
    const hit = next.match(/长期有效|\d{4}-\d{1,2}-\d{1,2}/);
    return hit ? hit[0] : next.split(/\n/)[0].trim().slice(0, 32);
  }
  if (META_KEYS.has(key) || kind === "text") return next.split(/\n/)[0].trim();
  return next;
}

function parseLabeledKnowledge(meta, text) {
  const extra = {
    name: ["名称", "产品名称"],
    summary: ["摘要", "一句话定义"],
    identity: ["产品是什么", "产品核心定位"],
    core_scenarios: ["核心场景摘要", "产品核心场景"],
    core_value: ["产品核心价值"],
    value_proposition: ["核心价值主张"],
    source_version: ["来源版本", "当前版本"],
  };
  const source = text.replace(/\r\n/g, "\n");
  const entries = [];
  extra.name.forEach((label) => entries.push({ key: "name", label }));
  extra.summary.forEach((label) => entries.push({ key: "summary", label }));
  meta.fields.forEach((field) => {
    entries.push({ key: field.key, label: field.label });
    (extra[field.key] || []).forEach((label) => entries.push({ key: field.key, label }));
  });
  entries.sort((a, b) => b.label.length - a.label.length);
  const labels = entries.map((item) => item.label);
  const hits = [];
  entries.forEach((entry) => {
    const re = new RegExp(`(?:^|\\n)\\s*${escapeReg(entry.label)}(?:\\s*[:：]\\s*|\\s+|(?=[^\\s:：\\n]))`, "g");
    let match = re.exec(source);
    while (match) {
      const labelAt = match.index + match[0].indexOf(entry.label);
      const shorter = labels.some((other) => other.length > entry.label.length && source.startsWith(other, labelAt));
      if (!shorter) {
        hits.push({
          key: entry.key,
          start: match.index,
          valueStart: match.index + match[0].length,
          exact: entry.label === (meta.fields.find((field) => field.key === entry.key)?.label || entry.key),
        });
      }
      match = re.exec(source);
    }
  });
  hits.sort((a, b) => a.valueStart - b.valueStart);
  const out = {};
  hits.forEach((hit, index) => {
    if (out[hit.key] && !hit.exact) return;
    const rawEnd = index + 1 < hits.length ? hits[index + 1].start : source.length;
    const field = meta.fields.find((item) => item.key === hit.key);
    const value = boundCellValue(source.slice(hit.valueStart, rawEnd), hit.key, field);
    if (value) out[hit.key] = value;
  });
  return out;
}

const sample = `产品名称 导购商品服务
当前版本 V2.1
来源 产品需求文档(PRD)
来源版本 V2.0
产品是什么 面向京东电器线下导购交易链路的多租户商品中台服务
产品服务谁 爱导购APP、京东电器小程序
产品解决什么问题 商品数据分散、缺乏统一出口
产品核心场景 商品搜索、价签打印
产品核心价值 按三层架构统一商品能力出口
核心价值主张 为线下导购交易链路提供统一支撑`;

const sampleNoSpace = `名称导购商品服务
失效时间长期有效 最后更新时间 2026-09-18
产品是什么面向京东电器线下导购交易链路的多租户商品中台服务`;

const dump = `名称 导购商品服务 产品简称 DGS 所属业务 京东电器线下运营 产品负责人 刘静怡
摘要 导购商品服务是面向京东电器线下导购交易链路的商品中台服务
来源 产品需求文档（PRD）
来源版本 V2.0
生效时间 2026-09-18
失效时间 长期有效 最后更新时间 2026-09-18 二、产品一句话定义 导购商品服务是面向京东电器线下导购交易链路的商品中台服务 三、产品核心定位 项目 内容
所属模块 未填
产品是什么 面向京东电器线下导购交易链路的多租户商品中台服务
产品服务谁 爱导购APP、京东电器小程序
核心对象
名称 导购商品服务
失效时间 长期有效
对象名称 商品
含义 线下导购交易链路中的可售商品`;

const out = parseLabeledKnowledge(type, sample);
const dumped = parseLabeledKnowledge(type, dump);
const core = parseLabeledKnowledge(coreType, dump);
let failed = 0;
function assert(name, ok, extra) {
  if (ok) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`fail  ${name}`, extra);
  }
}
assert("表格无冒号仍能填产品是什么", (out.identity || "").includes("商品中台"), out);
assert("产品服务谁", (out.target_users || "").includes("爱导购"), out);
assert("来源不是来源版本", out.source.includes("PRD") && out.source_version === "V2.0", out);
assert("当前版本映射来源版本", out.source_version === "V2.0", out);
assert("产品名称", (out.name || "").includes("导购商品服务") && !(out.name || "").includes("产品简称"), out);
assert("名称不含简称负责人", dumped.name === "导购商品服务", dumped);
assert("失效时间只留长期有效", dumped.effective_to === "长期有效", dumped);
assert("失效时间不含一句话定义", !(dumped.effective_to || "").includes("一句话定义"), dumped);
assert("产品是什么仍对齐", (dumped.identity || "").includes("商品中台"), dumped);
assert("核心对象失效时间不吞全文", core.effective_to === "长期有效", core);
assert("核心对象能落到对象名称", core.object_name === "商品", core);
const glued = parseLabeledKnowledge(type, sampleNoSpace);
assert("无空格标签仍能切名称", glued.name === "导购商品服务", glued);
assert("无空格标签仍能切失效时间", glued.effective_to === "长期有效", glued);
assert("无空格标签仍能切产品是什么", (glued.identity || "").includes("商品中台"), glued);

if (failed) process.exit(1);
console.log("\nPDF 表格对齐通过");
