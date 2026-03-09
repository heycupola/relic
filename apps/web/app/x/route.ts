import { NextResponse } from "next/server";
import { SITE_X_URL } from "@/lib/site";

export function GET() {
  return NextResponse.redirect(SITE_X_URL, 308);
}
