import { type NextRequest, NextResponse } from "next/server";

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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest).*)"],
};
