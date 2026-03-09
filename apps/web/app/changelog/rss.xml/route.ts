import { getChangelogEntries } from "@/lib/content";
import { createRssFeed } from "@/lib/rss";
import {
  CHANGELOG_DESCRIPTION,
  CHANGELOG_FEED_PATH,
  CHANGELOG_TITLE,
  getAbsoluteUrl,
  SITE_URL,
} from "@/lib/site";

export async function GET() {
  const entries = await getChangelogEntries();
  const xml = createRssFeed({
    title: `relic ${CHANGELOG_TITLE}`,
    description: CHANGELOG_DESCRIPTION,
    siteUrl: getAbsoluteUrl("/changelog"),
    feedUrl: getAbsoluteUrl(CHANGELOG_FEED_PATH),
    items: entries.map((entry) => ({
      title: entry.version,
      url: getAbsoluteUrl(entry.href),
      description: entry.description,
      date: entry.isoDate,
      guid: `${SITE_URL}${entry.href}`,
    })),
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
