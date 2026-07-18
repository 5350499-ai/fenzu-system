import { NextResponse } from "next/server";
import { apiErrorResponse, restoreApplicationSession } from "@/lib/server/account-auth";

export async function POST(request: Request) {
  try {
    await restoreApplicationSession(request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
