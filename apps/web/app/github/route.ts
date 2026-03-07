import { NextResponse } from "next/server";
import { SITE_GITHUB_URL } from "@/lib/site";

export function GET() {
  return NextResponse.redirect(SITE_GITHUB_URL, 308);
}
