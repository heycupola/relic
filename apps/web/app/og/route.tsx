import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { getBlogPostBySlug, getChangelogEntryBySlug } from "@/lib/content";
import { createOgImage } from "@/lib/og-image";
import {
  BLOG_DESCRIPTION,
  BLOG_TITLE,
  CHANGELOG_DESCRIPTION,
  CHANGELOG_TITLE,
  SITE_DESCRIPTION,
  SITE_SLOGAN,
} from "@/lib/site";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const slug = searchParams.get("slug");

  switch (type) {
    case "home":
      return await createOgImage({
        eyebrow: "relic",
        title: SITE_SLOGAN,
        description: SITE_DESCRIPTION,
      });
    case "blog-index":
      return await createOgImage({
        eyebrow: "Blog",
        title: BLOG_TITLE,
        description: BLOG_DESCRIPTION,
      });
    case "changelog-index":
      return await createOgImage({
        eyebrow: "Changelog",
        title: CHANGELOG_TITLE,
        description: CHANGELOG_DESCRIPTION,
      });
    case "blog-entry": {
      if (!slug) notFound();
      const post = await getBlogPostBySlug(slug);
      if (!post) notFound();

      return await createOgImage({
        eyebrow: "Blog",
        title: post.title,
        description: post.description,
        footer: `${post.formattedDate}  ·  ${post.readingTimeText}`,
      });
    }
    case "changelog-entry": {
      if (!slug) notFound();
      const entry = await getChangelogEntryBySlug(slug);
      if (!entry) notFound();

      return await createOgImage({
        eyebrow: `Changelog · ${entry.version}`,
        title: entry.description,
        description: entry.formattedDate,
      });
    }
    default:
      notFound();
  }
}
