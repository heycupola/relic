import type { Metadata } from "next";
import Link from "next/link";
import { ContentPageShell } from "@/components/content-page-shell";
import { JsonLd } from "@/components/json-ld";
import { getChangelogEntries } from "@/lib/content";
import { getChangelogMetadata } from "@/lib/content-seo";
import { renderMdx } from "@/lib/mdx";
import {
  CHANGELOG_DESCRIPTION,
  CHANGELOG_FEED_PATH,
  CHANGELOG_TITLE,
  getAbsoluteUrl,
  SITE_BRAND_NAME,
  SITE_DOCS_URL,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = getChangelogMetadata();

export default async function ChangelogPage() {
  const entries = await getChangelogEntries();

  const entriesWithContent = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      content: await renderMdx(entry.body),
    })),
  );

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
                url: getAbsoluteUrl(`/changelog#${entry.slug}`),
                name: entry.version,
                description: entry.description,
              })),
            },
          }
        : {}),
    },
  ];

  return (
    <ContentPageShell>
      <JsonLd data={structuredData} />

      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {CHANGELOG_TITLE}
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-foreground/60">
                {CHANGELOG_DESCRIPTION}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                href={CHANGELOG_FEED_PATH}
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                RSS
              </Link>
              <span className="text-border" aria-hidden="true">
                /
              </span>
              <Link
                href="/blog"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Blog
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-12">
          {entries.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                No releases yet
              </p>
              <p className="mt-3 text-sm text-foreground/50">
                Release notes will appear here as versions ship.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link
                  href={SITE_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border px-3 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground hover:text-background"
                >
                  Docs
                </Link>
                <Link
                  href="/github"
                  className="border border-border px-3 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground hover:text-background"
                >
                  GitHub
                </Link>
              </div>
            </div>
          ) : (
            <div>
              {entriesWithContent.map((entry, index) => (
                <div
                  key={entry.slug}
                  id={entry.slug}
                  className={index < entriesWithContent.length - 1 ? "border-b border-border" : ""}
                >
                  <div className="grid grid-cols-1 gap-0 lg:grid-cols-[200px_1fr]">
                    <div className="pb-2 pt-8 lg:py-10 lg:pr-8">
                      <div className="lg:sticky lg:top-24 space-y-1.5">
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                          {entry.version}
                        </h2>
                        <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                          {entry.formattedDate}
                        </div>
                        {entry.releaseUrl && (
                          <Link
                            href={entry.releaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block pt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            GitHub &rarr;
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="pb-10 pt-2 lg:border-l lg:border-border lg:py-10 lg:pl-10">
                      <div className="content-prose">{entry.content}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </ContentPageShell>
  );
}
