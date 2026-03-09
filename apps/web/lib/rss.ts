interface RssItem {
  title: string;
  url: string;
  description: string;
  date: string;
  guid?: string;
}

interface RssFeedOptions {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  items: RssItem[];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createRssFeed({
  title,
  description,
  siteUrl,
  feedUrl,
  items,
}: RssFeedOptions): string {
  const feedItems = items
    .map((item) =>
      `
        <item>
          <title>${escapeXml(item.title)}</title>
          <link>${escapeXml(item.url)}</link>
          <guid>${escapeXml(item.guid || item.url)}</guid>
          <pubDate>${new Date(item.date).toUTCString()}</pubDate>
          <description>${escapeXml(item.description)}</description>
        </item>
      `.trim(),
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    ${feedItems}
  </channel>
</rss>`;
}
