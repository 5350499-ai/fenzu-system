import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const isProduction = process.env.VERCEL_ENV === "production";
  if (isProduction && request.nextUrl.pathname.startsWith("/debug")) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/debug/:path*", "/api/debug/:path*"]
};
