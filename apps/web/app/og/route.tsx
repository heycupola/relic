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
      return createOgImage({
        eyebrow: "relic",
        title: SITE_SLOGAN,
        description: SITE_DESCRIPTION,
        footer: "CLI  •  TUI  •  Encrypted on your device",
      });
    case "blog-index":
      return createOgImage({
        eyebrow: "Blog",
        title: BLOG_TITLE,
        description: BLOG_DESCRIPTION,
        footer: "Product notes, design, and technical writing",
      });
    case "changelog-index":
      return createOgImage({
        eyebrow: "Changelog",
        title: CHANGELOG_TITLE,
        description: CHANGELOG_DESCRIPTION,
        footer: "Shipping notes and release history",
      });
    case "blog-entry": {
      if (!slug) notFound();
      const post = await getBlogPostBySlug(slug);
      if (!post) notFound();

      return createOgImage({
        eyebrow: "Blog",
        title: post.title,
        description: post.description,
        footer: `${post.formattedDate}  •  ${post.readingTimeText}`,
      });
    }
    case "changelog-entry": {
      if (!slug) notFound();
      const entry = await getChangelogEntryBySlug(slug);
      if (!entry) notFound();

      return createOgImage({
        eyebrow: "Changelog",
        title: entry.version,
        description: entry.description,
        footer: entry.formattedDate,
      });
    }
    default:
      notFound();
  }
}
