import { type NextRequest, NextResponse } from "next/server";
import { SESSION_HINT_COOKIE } from "@/lib/cookies";

const SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

const EU_EEA_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "CH",
  "GB",
]);

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const country = request.headers.get("CF-IPCountry") ?? "";
  const isEU = EU_EEA_COUNTRIES.has(country.toUpperCase());

  response.cookies.set("relic-geo", isEU ? "eu" : "other", {
    path: "/",
    sameSite: "lax",
    maxAge: 86400,
  });

  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (hasSessionCookie) {
    response.cookies.set(SESSION_HINT_COOKIE, "1", { path: "/", sameSite: "lax" });
  } else if (request.cookies.has(SESSION_HINT_COOKIE)) {
    response.cookies.delete(SESSION_HINT_COOKIE);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest).*)"],
};
