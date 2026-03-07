import type { Metadata } from "next";
import Link from "next/link";
import { ContentEmptyState } from "@/components/content-empty-state";
import { ContentHero } from "@/components/content-hero";
import { ContentPageShell } from "@/components/content-page-shell";
import { JsonLd } from "@/components/json-ld";
import { getChangelogEntries } from "@/lib/content";
import { getChangelogMetadata } from "@/lib/content-seo";
import {
  CHANGELOG_DESCRIPTION,
  CHANGELOG_FEED_PATH,
  CHANGELOG_TITLE,
  getAbsoluteUrl,
  SITE_BRAND_NAME,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = getChangelogMetadata();

export default async function ChangelogPage() {
  const entries = await getChangelogEntries();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `relic ${CHANGELOG_TITLE}`,
      description: CHANGELOG_DESCRIPTION,
      url: getAbsoluteUrl("/changelog"),
      publisher: {
        "@type": "Organization",
        name: SITE_BRAND_NAME,
        url: SITE_URL,
      },
      ...(entries.length > 0
        ? {
            mainEntity: {
              "@type": "ItemList",
              itemListElement: entries.map((entry, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: getAbsoluteUrl(entry.href),
                name: entry.version,
                description: entry.description,
              })),
            },
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: getAbsoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: CHANGELOG_TITLE,
          item: getAbsoluteUrl("/changelog"),
        },
      ],
    },
  ];

  return (
    <ContentPageShell>
      <JsonLd data={structuredData} />
      <ContentHero
        eyebrow="Shipping Notes"
        title={CHANGELOG_TITLE}
        description={CHANGELOG_DESCRIPTION}
        actions={[
          { href: CHANGELOG_FEED_PATH, label: "RSS Feed" },
          { href: "/blog", label: "Blog" },
        ]}
        meta={
          <span>
            {entries.length} {entries.length === 1 ? "release" : "releases"}
          </span>
        }
      />

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
          {entries.length === 0 ? (
            <ContentEmptyState
              eyebrow="No releases yet"
              title="No changelog entries have been published."
              description="Release notes will show up here as soon as versions start shipping. Until then, GitHub and the docs are the best places to follow progress."
              hint="This page is ready for automated release notes."
              actions={[
                { href: "https://docs.relic.so", label: "Read Docs", external: true },
                { href: "/github", label: "View GitHub" },
              ]}
            />
          ) : (
            <div className="border-2 border-border bg-card">
              {entries.map((entry, index) => (
                <Link
                  key={entry.slug}
                  href={entry.href}
                  className="group block border-b border-border px-5 py-5 transition-colors last:border-b-0 hover:bg-muted/40 sm:px-8 sm:py-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                        {entry.collection} / {entry.formattedDate}
                      </div>
                      <h2 className="text-2xl font-semibold tracking-tight text-balance text-foreground">
                        {entry.version}
                      </h2>
                      <p className="max-w-4xl text-sm leading-relaxed text-foreground/65">
                        {entry.description}
                      </p>
                    </div>
                    <div className="shrink-0 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                      {index === 0 ? "Latest" : "View"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </ContentPageShell>
  );
}
