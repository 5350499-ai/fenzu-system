import { AccountApiError, apiErrorResponse } from "@/lib/server/account-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    throw new AccountApiError("整包 ZIP 恢复接口已停用，请使用逐附件恢复流程。", 410, "ATTACHMENT_ZIP_ROUTE_RETIRED");
  } catch (error) {
    return apiErrorResponse(error);
  }
}
