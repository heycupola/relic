export const revalidate = 3600;

export async function GET() {
  try {
    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "relic-web",
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch("https://api.github.com/repos/heycupola/relic", {
      headers,
    });

    if (!res.ok) {
      console.error(`GitHub API error: ${res.status} ${res.statusText}`);
      return Response.json({ stars: null }, { status: 200 });
    }

    const data = await res.json();

    return Response.json(
      { stars: data.stargazers_count ?? 0 },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch GitHub stars:", error);
    return Response.json({ stars: null }, { status: 200 });
  }
}
