import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleLayout } from "@/components/article-layout";
import { ContentPageShell } from "@/components/content-page-shell";
import { JsonLd } from "@/components/json-ld";
import { getAdjacentBlogPosts, getBlogPostBySlug, getBlogPosts } from "@/lib/content";
import { getEntryMetadata } from "@/lib/content-seo";
import { renderMdx } from "@/lib/mdx";
import { getAbsoluteUrl, SITE_BRAND_NAME, SITE_URL } from "@/lib/site";

interface BlogPostPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    return {
      title: "Post Not Found",
      robots: { index: false, follow: false },
    };
  }

  return getEntryMetadata(post);
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const [content, adjacent] = await Promise.all([
    renderMdx(post.body),
    getAdjacentBlogPosts(post.slug),
  ]);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.isoDate,
      dateModified: post.isoDate,
      author: {
        "@type": "Person",
        name: post.author,
      },
      publisher: {
        "@type": "Organization",
        name: SITE_BRAND_NAME,
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: getAbsoluteUrl("/icon.svg"),
        },
      },
      mainEntityOfPage: getAbsoluteUrl(post.href),
      image: getAbsoluteUrl(post.ogImagePath),
      articleSection: post.category,
      keywords: post.tags.join(", "),
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
          name: "Blog",
          item: getAbsoluteUrl("/blog"),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: post.title,
          item: getAbsoluteUrl(post.href),
        },
      ],
    },
  ];

  return (
    <ContentPageShell>
      <JsonLd data={structuredData} />
      <ArticleLayout
        entry={post}
        backHref="/blog"
        backLabel="Back to blog"
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
