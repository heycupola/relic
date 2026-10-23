import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { BlogPost } from "@/lib/content";

function PostListItem({ post }: { post: BlogPost }) {
  return (
    <li>
      <Link
        href={post.href}
        className="group grid grid-cols-1 gap-3 p-5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground sm:grid-cols-[148px_minmax(0,1fr)_auto] sm:gap-8 sm:p-7"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground sm:flex-col sm:items-start sm:gap-1.5 sm:pt-1">
          <time dateTime={post.isoDate}>{post.formattedDate}</time>
          <span aria-hidden="true" className="sm:hidden">
            ·
          </span>
          <span>{post.category}</span>
          {post.featured && (
            <span className="bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase text-background sm:mt-1">
              Featured
            </span>
          )}
        </div>

        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-balance text-foreground decoration-foreground/30 underline-offset-4 group-hover:underline sm:text-xl">
            {post.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/60 text-pretty sm:text-base">
            {post.description}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[11px] text-muted-foreground">
            <span>{post.readingTimeText}</span>
            {post.tags.slice(0, 4).map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </div>

        <ArrowRight
          aria-hidden="true"
          className="hidden h-5 w-5 self-center text-muted-foreground transition-[color,transform] group-hover:translate-x-1 group-hover:text-foreground sm:block"
        />
      </Link>
    </li>
  );
}

export function PostList({ posts }: { posts: BlogPost[] }) {
  return (
    <ol className="divide-y-2 divide-border border-2 border-border bg-card">
      {posts.map((post) => (
        <PostListItem key={post.slug} post={post} />
      ))}
    </ol>
  );
}
