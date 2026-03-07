import type { MetadataRoute } from "next";
import { getAllPublicContentRoutes } from "@/lib/content";
import { getAbsoluteUrl, PUBLIC_SITE_ROUTES } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const contentRoutes = await getAllPublicContentRoutes();
  const routes = [...new Set([...PUBLIC_SITE_ROUTES, ...contentRoutes])];

  return routes.map((path) => ({
    url: getAbsoluteUrl(path),
    lastModified,
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
