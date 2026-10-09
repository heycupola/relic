import type { MetadataRoute } from "next";
import { getBlogPosts, getChangelogEntries } from "@/lib/content";
import { getAbsoluteUrl, PUBLIC_SITE_ROUTES } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Changelog entries redirect to anchors on /changelog, so only blog posts get their own URLs.
  const [blogPosts, changelogEntries] = await Promise.all([getBlogPosts(), getChangelogEntries()]);

  const contentDates = new Map<string, string>();
  for (const post of blogPosts) {
    contentDates.set(post.href, post.isoDate);
  }

  const latestBlogDate = blogPosts[0]?.isoDate;
  const latestChangelogDate = changelogEntries[0]?.isoDate;
  if (latestBlogDate) contentDates.set("/blog", latestBlogDate);
  if (latestChangelogDate) contentDates.set("/changelog", latestChangelogDate);

  const routes = [...new Set([...PUBLIC_SITE_ROUTES, ...blogPosts.map((p) => p.href)])];

  return routes.map((path) => {
    const lastModified = contentDates.get(path);
    return {
      url: getAbsoluteUrl(path),
      ...(lastModified && { lastModified }),
      changeFrequency:
        path === "/"
          ? "weekly"
          : path.startsWith("/blog") || path.startsWith("/changelog")
            ? "monthly"
            : "yearly",
      priority:
        path === "/"
          ? 1
          : path === "/blog" || path === "/changelog"
            ? 0.7
            : path.startsWith("/blog/")
              ? 0.5
              : 0.2,
    };
  });
}
