/**
 * 用用户上传的标准知识稿验证：应按字段标签对齐，而不是把助手开场白填进名称。
 */
import { readFileSync } from "node:fs";

const type = {
  name: "产品定位",
  fields: [
    { key: "source", label: "来源" },
    { key: "source_version", label: "来源版本" },
    { key: "effective_from", label: "生效时间" },
    { key: "effective_to", label: "失效时间" },
    { key: "owner_module", label: "所属模块" },
    { key: "identity", label: "产品是什么", required: true },
    { key: "target_users", label: "产品服务谁", required: true },
    { key: "problems", label: "产品解决什么问题", required: true },
    { key: "core_scenarios", label: "核心场景摘要" },
    { key: "core_value", label: "产品核心价值", required: true },
    { key: "value_proposition", label: "核心价值主张" },
    { key: "positioning_formula", label: "产品定位公式" },
    { key: "in_scope_brief", label: "属于本产品" },
    { key: "out_scope_brief", label: "不属于本产品" },
  ],
};

function escapeReg(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAssistantPreamble(text) {
  const value = String(text || "").trim();
  return /^你是「/.test(value) || value.includes("产品知识助手") || value.includes("只依据下列已治理");
}

function parseLabeledKnowledge(meta, text) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const rows = [
    { key: "name", label: "名称" },
    { key: "summary", label: "摘要" },
    { key: "summary", label: "产品简介" },
    ...meta.fields.map((field) => ({ key: field.key, label: field.label })),
  ].sort((a, b) => b.label.length - a.label.length);
  const hits = [];
  rows.forEach((entry) => {
    const re = new RegExp(`(?:^|\\n)\\s*${escapeReg(entry.label)}\\s*[:：][ \\t]*`, "g");
    let match = re.exec(source);
    while (match) {
      hits.push({ key: entry.key, label: entry.label, start: match.index, valueStart: match.index + match[0].length });
      match = re.exec(source);
    }
  });
  hits.sort((a, b) => a.valueStart - b.valueStart || b.label.length - a.label.length);
  const picked = [];
  const seen = new Set();
  hits.forEach((hit) => {
    if (seen.has(hit.valueStart)) return;
    seen.add(hit.valueStart);
    picked.push(hit);
  });
  const out = {};
  picked.forEach((hit, index) => {
    if (out[hit.key]) return;
    const rawEnd = index + 1 < picked.length ? picked[index + 1].start : source.length;
    let value = source.slice(hit.valueStart, rawEnd).trim();
    ["关键关系", "回答要求", "知识覆盖"].forEach((heading) => {
      const cut = value.search(new RegExp(`(?:^|\\n)\\s*${escapeReg(heading)}`));
      if (cut >= 0) value = value.slice(0, cut).trim();
    });
    if (value && !isAssistantPreamble(value)) out[hit.key] = value;
  });
  if (!out.name) {
    const named = source.match(/你是「([^」]+)」/);
    if (named?.[1]) {
      const product = named[1].replace(/的产品知识助手$/, "").replace(/\s*APP$/i, "").trim();
      if (product) out.name = `${product}${meta.name}`;
    }
  }
  if (!out.summary) {
    const fact = source.match(/产品定位与核心事实[：:]\s*\n?([^\n]+)/);
    if (fact?.[1] && !isAssistantPreamble(fact[1])) out.summary = fact[1].trim();
  }
  return out;
}

const text = readFileSync("/Users/tang/Downloads/system-prompt.txt", "utf8");
const out = parseLabeledKnowledge(type, text);

let failed = 0;
function assert(name, ok) {
  if (ok) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`fail  ${name}`);
    if (!ok && name.startsWith("字段")) console.error("   ", out);
  }
}

assert("名称不是助手开场白", out.name === "爱导购产品定位");
assert("摘要来自产品简介或核心事实", Boolean(out.summary) && !isAssistantPreamble(out.summary));
assert("来源不是文件名", out.source.includes("爱导购产品介绍"));
assert("来源版本", out.source_version === "V1.0");
assert("生效/失效/模块", out.effective_from === "2026-01-01" && out.effective_to === "长期有效" && out.owner_module === "产品整体");
assert("产品是什么", out.identity.includes("一站式数智化工作台"));
assert("产品服务谁", out.target_users.includes("门店一线员工"));
assert("产品解决什么问题", out.problems.includes("门店一线工具分散"));
assert("核心场景", out.core_scenarios.includes("店内代客成交"));
assert("核心价值", out.core_value.includes("用户价值"));
assert("价值主张", out.value_proposition.includes("一个 APP"));
assert("定位公式", out.positioning_formula.includes("面向【线下门店一线"));
assert("属于/不属于", out.in_scope_brief.includes("代客下单") && out.out_scope_brief.includes("仓储物流"));

if (failed) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log("\n标准知识稿按字段对齐通过");
