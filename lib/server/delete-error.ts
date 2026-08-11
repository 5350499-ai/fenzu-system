export type DeleteErrorClassification = {
  message: string;
  status: 403 | 409 | 500;
  code: "DELETE_FORBIDDEN" | "DELETE_REFERENCED" | "DELETE_FAILED";
};

export function classifyBusinessDeleteError(error: { code?: string } | null | undefined): DeleteErrorClassification {
  if (error?.code === "42501") return { message: "没有权限删除该记录。", status: 403, code: "DELETE_FORBIDDEN" };
  if (error?.code === "23503") return { message: "该记录仍有关联业务数据，无法删除，请先处理关联记录。", status: 409, code: "DELETE_REFERENCED" };
  return { message: "删除记录失败，请稍后重试。", status: 500, code: "DELETE_FAILED" };
}
