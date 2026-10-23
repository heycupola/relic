import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type React from "react";
import type { BlogPost } from "@/lib/content";
import type { MdxHeading } from "@/lib/mdx";
import { getAbsoluteUrl } from "@/lib/site";
import { focusRing, rowActionButton } from "@/lib/styles";
import { ContentCta } from "./content-cta";
import { CopyLinkButton } from "./copy-link-button";
import { ReadingProgress } from "./reading-progress";
import { TableOfContents } from "./table-of-contents";

const ARTICLE_BODY_ID = "article-body";

interface ArticleLayoutProps {
  post: BlogPost;
  headings: MdxHeading[];
  previous?: BlogPost;
  next?: BlogPost;
  children: React.ReactNode;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function AdjacentPostLink({ post, direction }: { post: BlogPost; direction: "previous" | "next" }) {
  const isNext = direction === "next";

  return (
    <Link
      href={post.href}
      className={`group flex h-full flex-col gap-2 border-2 border-border bg-card p-5 transition-colors hover:border-foreground/40 hover:bg-muted/40 sm:p-6 ${isNext ? "sm:col-start-2 sm:items-end sm:text-right" : ""} ${focusRing}`}
    >
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {!isNext && (
          <ArrowLeft
            className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
        )}
        {isNext ? "Newer post" : "Older post"}
        {isNext && (
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="font-semibold tracking-tight text-foreground text-balance">
        {post.title}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{post.formattedDate}</span>
    </Link>
  );
}

export function ArticleLayout({ post, headings, previous, next, children }: ArticleLayoutProps) {
  const url = getAbsoluteUrl(post.href);
  const shareOnXUrl = `https://x.com/intent/post?${new URLSearchParams({ text: post.title, url })}`;

  return (
    <>
      <ReadingProgress targetId={ARTICLE_BODY_ID} />

      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:px-6 sm:pt-10 sm:pb-16 md:pb-20 lg:px-12">
          <nav aria-label="Breadcrumb">
            <Link
              href="/blog"
              className={`group -ml-1 inline-flex items-center gap-1.5 px-1 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}
            >
              <ArrowLeft
                className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
              All posts
            </Link>
          </nav>

          <div className="mt-10 sm:mt-14">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-foreground/60 sm:text-sm">
              <span>{post.category}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={post.isoDate}>{post.formattedDate}</time>
              <span aria-hidden="true">·</span>
              <span>{post.readingTimeText}</span>
            </p>
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl md:text-5xl">
              {post.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base text-foreground/60 text-pretty sm:mt-6 sm:text-lg">
              {post.description}
            </p>
            <div className="mt-8 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center bg-foreground font-mono text-xs font-bold text-background"
              >
                {getInitials(post.author)}
              </span>
              <span className="text-sm">
                <span className="sr-only">Written by </span>
                <span className="font-medium text-foreground">{post.author}</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-border">
        <div className="mx-auto grid max-w-5xl grid-cols-1 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:px-12">
          <article id={ARTICLE_BODY_ID} className="min-w-0 py-10 sm:py-14 lg:pr-12">
            <div className="content-prose">{children}</div>
          </article>
          {headings.length > 0 && (
            <aside className="hidden border-l border-border py-14 pl-8 lg:block">
              <div className="sticky top-28">
                <TableOfContents headings={headings} />
              </div>
            </aside>
          )}
        </div>
      </div>

      <div className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-12">
          {post.tags.length > 0 ? (
            <ul aria-label="Tags" className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <li
                  key={tag}
                  className="border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            <CopyLinkButton url={url} />
            <a
              href={shareOnXUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={rowActionButton}
            >
              <span aria-hidden="true">𝕏</span>
              Share on X
            </a>
          </div>
        </div>
      </div>

      {(previous || next) && (
        <nav aria-label="More posts" className="border-b border-border">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 px-4 py-10 sm:grid-cols-2 sm:gap-4 sm:px-6 sm:py-12 lg:px-12">
            {previous && <AdjacentPostLink post={previous} direction="previous" />}
            {next && <AdjacentPostLink post={next} direction="next" />}
          </div>
        </nav>
      )}

      <ContentCta
        title="Keep secrets out of plaintext"
        description="Install the CLI, import your .env, and run anything with secrets injected in memory. Free and open source."
      />
    </>
  );
}
