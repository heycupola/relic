import { getBlogPosts } from "@/lib/content";
import { createRssFeed } from "@/lib/rss";
import { BLOG_DESCRIPTION, BLOG_FEED_PATH, BLOG_TITLE, getAbsoluteUrl, SITE_URL } from "@/lib/site";

export async function GET() {
  const posts = await getBlogPosts();
  const xml = createRssFeed({
    title: `relic ${BLOG_TITLE}`,
    description: BLOG_DESCRIPTION,
    siteUrl: getAbsoluteUrl("/blog"),
    feedUrl: getAbsoluteUrl(BLOG_FEED_PATH),
    items: posts.map((post) => ({
      title: post.title,
      url: getAbsoluteUrl(post.href),
      description: post.description,
      date: post.isoDate,
      guid: `${SITE_URL}${post.href}`,
    })),
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
