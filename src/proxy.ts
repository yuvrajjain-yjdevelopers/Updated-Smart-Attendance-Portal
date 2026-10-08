import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const session = request.cookies.get("attendance_session")?.value;
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*", "/my-class/:path*", "/teachers/:path*", "/sections/:path*", "/students/:path*", "/messages/:path*", "/settings/:path*"] };
