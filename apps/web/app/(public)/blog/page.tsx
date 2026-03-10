import type { Metadata } from "next";
import { ContentCard } from "@/components/content-card";
import { ContentEmptyState } from "@/components/content-empty-state";
import { ContentHero } from "@/components/content-hero";
import { ContentPageShell } from "@/components/content-page-shell";
import { JsonLd } from "@/components/json-ld";
import { getBlogPosts } from "@/lib/content";
import { getBlogMetadata } from "@/lib/content-seo";
import {
  BLOG_DESCRIPTION,
  BLOG_FEED_PATH,
  BLOG_TITLE,
  getAbsoluteUrl,
  SITE_BRAND_NAME,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = getBlogMetadata();

export default async function BlogPage() {
  const posts = await getBlogPosts();
  const [featuredPost, ...otherPosts] = posts;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: `relic ${BLOG_TITLE}`,
      description: BLOG_DESCRIPTION,
      url: getAbsoluteUrl("/blog"),
      publisher: {
        "@type": "Organization",
        name: SITE_BRAND_NAME,
        url: SITE_URL,
      },
      ...(posts.length > 0
        ? {
            blogPost: posts.map((post) => ({
              "@type": "BlogPosting",
              headline: post.title,
              description: post.description,
              url: getAbsoluteUrl(post.href),
              datePublished: post.isoDate,
            })),
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
          name: BLOG_TITLE,
          item: getAbsoluteUrl("/blog"),
        },
      ],
    },
  ];

  return (
    <ContentPageShell>
      <JsonLd data={structuredData} />
      <ContentHero
        eyebrow="Journal"
        title={BLOG_TITLE}
        description={BLOG_DESCRIPTION}
        actions={[
          { href: BLOG_FEED_PATH, label: "RSS Feed" },
          { href: "/changelog", label: "Changelog" },
        ]}
        meta={
          <span>
            {posts.length} {posts.length === 1 ? "entry" : "entries"}
          </span>
        }
      />

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
          {posts.length === 0 ? (
            <ContentEmptyState
              eyebrow="No entries yet"
              title="The journal is not live yet."
              description="Long-form writing will appear here once the first posts are published. Until then, GitHub and the main product site are the best places to follow progress."
              hint="Writing is in progress."
              actions={[
                { href: "/github", label: "View GitHub" },
                { href: "/", label: "Back Home" },
              ]}
            />
          ) : (
            <>
              {featuredPost && (
                <div className="mb-8">
                  <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Featured
                  </div>
                  <ContentCard entry={featuredPost} />
                </div>
              )}

              {otherPosts.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {otherPosts.map((post) => (
                    <ContentCard key={post.slug} entry={post} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </ContentPageShell>
  );
}
