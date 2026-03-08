import handler from "./server/index.js";

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

export default {
  async fetch(request) {
    const country = request.headers.get("CF-IPCountry") || "";
    const isEU = EU_EEA_COUNTRIES.has(country.toUpperCase());
    const response = await handler(request);
    const newResponse = new Response(response.body, response);
    newResponse.headers.append(
      "Set-Cookie",
      `relic-geo=${isEU ? "eu" : "other"}; Path=/; SameSite=Lax; Max-Age=86400`,
    );
    return newResponse;
  },
};
