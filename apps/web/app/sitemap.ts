import type { MetadataRoute } from "next";
import { getBlogPosts, getChangelogEntries } from "@/lib/content";
import { getAbsoluteUrl, PUBLIC_SITE_ROUTES } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [blogPosts, changelogEntries] = await Promise.all([getBlogPosts(), getChangelogEntries()]);

  const contentDates = new Map<string, string>();
  for (const post of blogPosts) {
    contentDates.set(post.href, post.isoDate);
  }
  for (const entry of changelogEntries) {
    contentDates.set(entry.href, entry.isoDate);
  }

  const latestBlogDate = blogPosts[0]?.isoDate;
  const latestChangelogDate = changelogEntries[0]?.isoDate;
  if (latestBlogDate) contentDates.set("/blog", latestBlogDate);
  if (latestChangelogDate) contentDates.set("/changelog", latestChangelogDate);

  const contentRoutes = [...blogPosts.map((p) => p.href), ...changelogEntries.map((e) => e.href)];
  const routes = [...new Set([...PUBLIC_SITE_ROUTES, ...contentRoutes])];

  return routes.map((path) => ({
    url: getAbsoluteUrl(path),
    lastModified: contentDates.get(path) ?? new Date().toISOString(),
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
          : path.startsWith("/blog/") || path.startsWith("/changelog/")
            ? 0.5
            : 0.2,
  }));
}
