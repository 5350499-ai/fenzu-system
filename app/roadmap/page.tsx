"use client";

import { AppLayout } from "@/components/app-layout";
import { CheckCircle2, Lightbulb, ListTodo, Wrench } from "lucide-react";

const roadmapGroups = [
  { title: "已完成", icon: CheckCircle2, tone: "completed", items: ["Backup / Restore", "Global Cache V3"] },
  { title: "开发中", icon: Wrench, tone: "in-progress", items: ["产品路线图"] },
  { title: "已规划", icon: ListTodo, tone: "planned", items: ["本地附件导入/导出", "全软件页面跳转优化", "UI细节优化", "多房源支持", "订阅系统（后续功能，暂未开放）", "云备份", "历史恢复增强", "附件容量管理", "多人协作（高级合伙人）"] },
  { title: "想法", icon: Lightbulb, tone: "idea", items: [] }
] as const;

export default function RoadmapPage() {
  return <AppLayout title="产品路线图（Roadmap）" description="记录产品方向，当前所有功能均保持免费。">
    <section className="card panel roadmap-intro"><h2 className="panel-title">产品路线图</h2><p className="muted">这里记录产品规划与维护方向，不代表已开放的功能，也不涉及支付或订阅。</p></section>
    <div className="roadmap-groups">
      {roadmapGroups.map(({ title, icon: Icon, tone, items }) => <section className={`card panel roadmap-group roadmap-group--${tone}`} key={title}>
        <div className="panel-header"><h2 className="panel-title"><Icon size={19} /> {title}</h2><span className="roadmap-count">{items.length}</span></div>
        {items.length ? <ul className="roadmap-list">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">暂未记录，欢迎在后续规划中补充。</p>}
      </section>)}
    </div>
  </AppLayout>;
}
