import { ArrowRight, ArrowUpRight, ChevronDown, Rss } from "lucide-react";
import type { Metadata } from "next";
import { ChangelogRelease } from "@/components/changelog-release";
import { ContentCta } from "@/components/content-cta";
import { ContentEmptyState } from "@/components/content-empty-state";
import { ContentHero } from "@/components/content-hero";
import { ContentPageShell } from "@/components/content-page-shell";
import { CopyCommand } from "@/components/copy-command";
import { HashAwareDetails } from "@/components/hash-aware-details";
import { JsonLd } from "@/components/json-ld";
import { getChangelogEntries } from "@/lib/content";
import { getChangelogMetadata } from "@/lib/content-seo";
import { renderMdx } from "@/lib/mdx";
import {
  BLOG_PATH,
  CHANGELOG_DESCRIPTION,
  CHANGELOG_FEED_PATH,
  CHANGELOG_TITLE,
  getAbsoluteUrl,
  SITE_BRAND_NAME,
  SITE_RELEASES_URL,
  SITE_URL,
} from "@/lib/site";
import { focusRing } from "@/lib/styles";

export const metadata: Metadata = getChangelogMetadata();

export default async function ChangelogPage() {
  const entries = await getChangelogEntries();

  const releases = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      content: (await renderMdx(entry.body, { variant: "changelog" })).content,
    })),
  );
  const supported = releases.filter(({ entry }) => !entry.deprecated);
  const deprecated = releases.filter(({ entry }) => entry.deprecated);
  const latest = supported[0]?.entry;
  const oldestDeprecated = deprecated.at(-1)?.entry;
  const newestDeprecated = deprecated[0]?.entry;

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Relic ${CHANGELOG_TITLE}`,
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
      <ContentHero
        eyebrow="Every release of the CLI, TUI, MCP server & dashboard"
        title={CHANGELOG_TITLE}
        description={CHANGELOG_DESCRIPTION}
        links={[
          {
            href: CHANGELOG_FEED_PATH,
            label: "RSS feed",
            icon: <Rss className="h-4 w-4" aria-hidden="true" />,
          },
          {
            href: SITE_RELEASES_URL,
            label: "GitHub releases",
            external: true,
            icon: <ArrowUpRight className="h-4 w-4" aria-hidden="true" />,
          },
          {
            href: BLOG_PATH,
            label: "Blog",
            icon: <ArrowRight className="h-4 w-4" aria-hidden="true" />,
          },
        ]}
      >
        {latest && (
          <div className="mt-10 flex flex-col gap-4 border-2 border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Latest release
              </p>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <a
                  href={`#${latest.slug}`}
                  className={`font-mono text-lg font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground ${focusRing}`}
                >
                  {latest.version}
                </a>
                <time dateTime={latest.isoDate} className="font-mono text-xs text-muted-foreground">
                  {latest.formattedDate}
                </time>
              </p>
            </div>
            <div className="sm:w-64">
              <CopyCommand command="relic upgrade" />
            </div>
          </div>
        )}
      </ContentHero>

      <section aria-label="Releases" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-12">
          {entries.length === 0 ? (
            <div className="py-10 sm:py-14">
              <ContentEmptyState
                title="No releases yet"
                description="Release notes will show up here as new versions ship."
                actions={[{ href: SITE_RELEASES_URL, label: "GitHub releases", external: true }]}
              />
            </div>
          ) : (
            supported.map(({ entry, content }) => (
              <ChangelogRelease
                key={entry.slug}
                entry={entry}
                content={content}
                isLatest={entry.slug === latest?.slug}
              />
            ))
          )}
        </div>
      </section>

      {deprecated.length > 0 && oldestDeprecated && newestDeprecated && (
        <section aria-label="Deprecated releases" className="border-b border-border">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-12">
            <HashAwareDetails
              className="group/details"
              summary={
                <summary
                  className={`flex cursor-pointer list-none items-center justify-between gap-4 py-6 transition-colors hover:text-foreground focus-visible:outline-offset-[-2px] sm:py-8 [&::-webkit-details-marker]:hidden ${focusRing}`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">
                      {deprecated.length} deprecated releases
                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                        {oldestDeprecated.version} – {newestDeprecated.version}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-foreground/60 text-pretty">
                      These early versions had packaging issues and are no longer supported. Use{" "}
                      {latest ? latest.version : "the latest release"} or newer.
                    </span>
                  </span>
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open/details:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
              }
            >
              <div className="border-t border-border">
                {deprecated.map(({ entry, content }) => (
                  <ChangelogRelease key={entry.slug} entry={entry} content={content} />
                ))}
              </div>
            </HashAwareDetails>
          </div>
        </section>
      )}

      <ContentCta
        title="Get the latest Relic"
        description="Already installed? Run relic upgrade. New here? Install the CLI and import your first .env in under a minute."
      />
    </ContentPageShell>
  );
}
