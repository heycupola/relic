export async function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "https://relic.so/relic-logo-dark.png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
