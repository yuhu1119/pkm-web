import ExtractSkillsPanel from "./ExtractSkillsPanel";

/**
 * 平台技能配置：文档解析原则、文档种类与 78 类对象覆盖。
 */
export default function SkillsPage() {
  return (
    <div>
      <div className="pkm-page-kicker">Skills</div>
      <h1 className="pkm-page-title">技能配置</h1>
      <p className="pkm-page-desc">配置文档解析原则，并按对象调整治理字段。详情页与 AI 抽文档共用这一套字段。</p>
      <div style={{ marginTop: 20 }}>
        <ExtractSkillsPanel />
      </div>
    </div>
  );
}
