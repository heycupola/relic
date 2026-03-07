import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleLayout } from "@/components/article-layout";
import { ContentPageShell } from "@/components/content-page-shell";
import { JsonLd } from "@/components/json-ld";
import {
  getAdjacentChangelogEntries,
  getChangelogEntries,
  getChangelogEntryBySlug,
} from "@/lib/content";
import { getEntryMetadata } from "@/lib/content-seo";
import { renderMdx } from "@/lib/mdx";
import { getAbsoluteUrl, SITE_BRAND_NAME, SITE_URL } from "@/lib/site";

interface ChangelogEntryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const entries = await getChangelogEntries();
  return entries.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: ChangelogEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getChangelogEntryBySlug(slug);

  if (!entry) {
    return {
      title: "Changelog Entry Not Found",
      robots: { index: false, follow: false },
    };
  }

  return getEntryMetadata(entry);
}

export default async function ChangelogEntryPage({ params }: ChangelogEntryPageProps) {
  const { slug } = await params;
  const entry = await getChangelogEntryBySlug(slug);

  if (!entry) {
    notFound();
  }

  const [content, adjacent] = await Promise.all([
    renderMdx(entry.body),
    getAdjacentChangelogEntries(entry.slug),
  ]);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: entry.version,
      name: entry.title,
      description: entry.description,
      datePublished: entry.isoDate,
      dateModified: entry.isoDate,
      url: getAbsoluteUrl(entry.href),
      image: getAbsoluteUrl(entry.ogImagePath),
      publisher: {
        "@type": "Organization",
        name: SITE_BRAND_NAME,
        url: SITE_URL,
      },
      about: {
        "@type": "SoftwareApplication",
        name: SITE_BRAND_NAME,
        applicationCategory: "DeveloperApplication",
      },
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
          name: "Changelog",
          item: getAbsoluteUrl("/changelog"),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: entry.version,
          item: getAbsoluteUrl(entry.href),
        },
      ],
    },
  ];

  return (
    <ContentPageShell>
      <JsonLd data={structuredData} />
      <ArticleLayout
        entry={entry}
        backHref="/changelog"
        backLabel="Back to changelog"
        externalHref={entry.releaseUrl}
        externalLabel={entry.releaseUrl ? "View on GitHub" : undefined}
        previousHref={adjacent.previous?.href}
        previousLabel={adjacent.previous?.title}
        nextHref={adjacent.next?.href}
        nextLabel={adjacent.next?.title}
      >
        {content}
      </ArticleLayout>
    </ContentPageShell>
  );
}
