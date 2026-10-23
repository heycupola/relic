import { ArrowRight, Rss } from "lucide-react";
import type { Metadata } from "next";
import { ContentEmptyState } from "@/components/content-empty-state";
import { ContentHero } from "@/components/content-hero";
import { ContentPageShell } from "@/components/content-page-shell";
import { JsonLd } from "@/components/json-ld";
import { PostList } from "@/components/post-list";
import { getBlogPosts } from "@/lib/content";
import { getBlogMetadata } from "@/lib/content-seo";
import {
  BLOG_DESCRIPTION,
  BLOG_FEED_PATH,
  BLOG_TITLE,
  CHANGELOG_PATH,
  getAbsoluteUrl,
  SITE_BRAND_NAME,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = getBlogMetadata();

export default async function BlogPage() {
  const posts = await getBlogPosts();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: `Relic ${BLOG_TITLE}`,
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
        eyebrow="Engineering notes · Product decisions · Security"
        title={BLOG_TITLE}
        description={BLOG_DESCRIPTION}
        links={[
          {
            href: BLOG_FEED_PATH,
            label: "RSS feed",
            icon: <Rss className="h-4 w-4" aria-hidden="true" />,
          },
          {
            href: CHANGELOG_PATH,
            label: "Changelog",
            icon: <ArrowRight className="h-4 w-4" aria-hidden="true" />,
          },
        ]}
      />

      <section aria-label="Posts" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-12">
          {posts.length === 0 ? (
            <ContentEmptyState
              title="No posts yet"
              description="Long-form writing will show up here once the first post is published. Until then, follow along on GitHub or the changelog."
              actions={[
                { href: CHANGELOG_PATH, label: "Changelog" },
                { href: "/github", label: "GitHub" },
              ]}
            />
          ) : (
            <>
              <div className="mb-4 flex items-baseline justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                <h2>All posts</h2>
                <span>
                  {posts.length} {posts.length === 1 ? "post" : "posts"}
                </span>
              </div>
              <PostList posts={posts} />
            </>
          )}
        </div>
      </section>
    </ContentPageShell>
  );
}
