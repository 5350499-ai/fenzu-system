import { euro } from "@/lib/format";
import type { CSSProperties } from "react";

type ProfitBarChartProps = {
  income: number;
  expense: number;
  netProfit: number;
  label?: string;
};

export function ProfitBarChart({ income, expense, netProfit, label = "收支与净利润对比" }: ProfitBarChartProps) {
  const scale = Math.max(Math.abs(income), Math.abs(expense), Math.abs(netProfit), 1);
  const rows = [
    { label: "收入", value: income, tone: "income" },
    { label: "支出", value: expense, tone: "expense" },
    { label: "净利润", value: netProfit, tone: netProfit < 0 ? "loss" : "net" }
  ];

  return (
    <div aria-label={label} className="profit-bar-chart">
      {rows.map((row) => (
        <div className="profit-bar-row" key={row.label}>
          <span>{row.label}</span>
          <div aria-hidden="true" className="profit-bar-track">
            <div className={`profit-bar-fill ${row.tone}`} style={{ "--profit-bar-width": `${(Math.abs(row.value) / scale) * 100}%` } as CSSProperties} />
          </div>
          <strong className={row.value < 0 ? "danger-text" : row.tone === "income" || row.tone === "net" ? "profit" : ""}>{euro(row.value)}</strong>
        </div>
      ))}
    </div>
  );
}
