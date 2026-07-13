import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount } from "@/lib/server/account-auth";
import { updateCustomAccount } from "@/lib/server/account-management";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request);
    const { id } = await params;
    await updateCustomAccount(context, id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
