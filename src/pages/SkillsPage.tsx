import ExtractSkillsPanel from "./ExtractSkillsPanel";

/**
 * 平台技能配置：文档解析原则、文档种类与 78 类对象覆盖。
 */
export default function SkillsPage() {
  return (
    <div>
      <p className="pkm-page-desc">
        每位用户的默认技能相同。你保存的覆盖只作用于自己的抽取，不影响其他人。系统提示词、全局原则、文档种类与对象技能都在这里配置。
      </p>
      <ExtractSkillsPanel />
    </div>
  );
}
