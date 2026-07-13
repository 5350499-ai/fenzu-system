import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount } from "@/lib/server/account-auth";

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    return NextResponse.json({
      profile: {
        id: context.profile.auth_user_id,
        username: context.profile.username,
        displayName: context.profile.display_name,
        accountType: context.profile.account_type,
        status: context.profile.status,
        propertyAccessMode: context.profile.property_access_mode,
        mustChangePassword: context.profile.must_change_password
      },
      isOwner: context.profile.account_type === "owner"
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
