import type { OperationsRoomStatusDistribution } from "@/lib/operations-analytics";

export function OperationsRoomStatusChart({ distribution }: { distribution: OperationsRoomStatusDistribution }) {
  if (!distribution.total) return <p className="operations-chart-empty">暂无可统计房间</p>;

  return (
    <div className="operations-room-status-chart" aria-label="当前房间状态比例">
      <div className="operations-room-status-track" aria-hidden="true">
        {distribution.items.map((item) => (
          <span className={`operations-room-status-segment ${item.key}`} key={item.key} style={{ width: `${item.percentage}%` }} />
        ))}
      </div>
      <div className="operations-room-status-legend">
        {distribution.items.map((item) => (
          <span key={item.key}><i className={`operations-room-status-dot ${item.key}`} />{item.label} {item.count}间 · {item.percentage}%</span>
        ))}
      </div>
    </div>
  );
}
