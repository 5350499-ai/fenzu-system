"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div className="pagination">
      <div className="top-actions">
        <span className="muted">
          第 {page} / {totalPages} 页，共 {total} 条
        </span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          <option value={10}>每页10条</option>
          <option value={15}>每页15条</option>
          <option value={20}>每页20条</option>
          <option value={50}>每页50条</option>
        </select>
      </div>
      <div className="top-actions">
        <button className="btn" disabled={page <= 1} type="button" onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={16} />
          上一页
        </button>
        <button className="btn" disabled={page >= totalPages} type="button" onClick={() => onPageChange(page + 1)}>
          下一页
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function pageRows<T>(rows: T[], page: number, pageSize: number) {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}
