import type { OperationsContractFlowMonth } from "@/lib/operations-analytics";

export function OperationsContractFlowChart({ months }: { months: OperationsContractFlowMonth[] }) {
  const maximum = Math.max(1, ...months.flatMap((month) => [month.started, month.ended]));
  const hasData = months.some((month) => month.started > 0 || month.ended > 0);

  return (
    <div className="operations-contract-flow-chart" aria-label="近6个月合同开始和结束统计">
      <div className="operations-chart-legend" aria-label="图例">
        <span><i className="operations-legend-start" />开始合同</span>
        <span><i className="operations-legend-end" />结束合同</span>
      </div>
      <div className="operations-flow-columns">
        {months.map((month) => (
          <div className="operations-flow-column" key={month.month}>
            <div className="operations-flow-up">
              <span className="operations-flow-count">{month.started}</span>
              <span
                aria-hidden="true"
                className="operations-flow-bar start"
                style={{ height: month.started ? `${Math.max(12, (month.started / maximum) * 100)}%` : "0%" }}
              />
            </div>
            <div className="operations-flow-zero" />
            <div className="operations-flow-down">
              <span
                aria-hidden="true"
                className="operations-flow-bar end"
                style={{ height: month.ended ? `${Math.max(12, (month.ended / maximum) * 100)}%` : "0%" }}
              />
              <span className="operations-flow-count">{month.ended}</span>
            </div>
            <span className="operations-flow-month">{month.label}</span>
          </div>
        ))}
      </div>
      {!hasData ? <p className="operations-chart-empty">最近6个月暂无合同开始或结束记录</p> : null}
    </div>
  );
}
