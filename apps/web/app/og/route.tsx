import { createOgImage } from "@/lib/og-image";
import {
  BLOG_DESCRIPTION,
  BLOG_TITLE,
  CHANGELOG_DESCRIPTION,
  CHANGELOG_TITLE,
  SITE_DESCRIPTION,
  SITE_SLOGAN,
} from "@/lib/site";

export const runtime = "edge";

const STATIC_PAGES: Record<string, { eyebrow: string; title: string; description: string }> = {
  home: { eyebrow: "relic", title: SITE_SLOGAN, description: SITE_DESCRIPTION },
  "blog-index": { eyebrow: "Blog", title: BLOG_TITLE, description: BLOG_DESCRIPTION },
  "changelog-index": {
    eyebrow: "Changelog",
    title: CHANGELOG_TITLE,
    description: CHANGELOG_DESCRIPTION,
  },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) return new Response("Missing type", { status: 400 });

    const staticPage = STATIC_PAGES[type];
    if (staticPage) {
      return await createOgImage(staticPage);
    }

    const title = searchParams.get("title");
    const description = searchParams.get("description");

    if (!title) return new Response("Missing title", { status: 400 });

    const eyebrow = type === "blog-entry" ? "Blog" : "Changelog";
    const footer = searchParams.get("footer") ?? "relic.so";

    return await createOgImage({
      eyebrow,
      title: decodeURIComponent(title),
      description: description ? decodeURIComponent(description) : "",
      footer: decodeURIComponent(footer),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
