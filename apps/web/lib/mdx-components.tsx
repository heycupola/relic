import Link from "next/link";
import type React from "react";

function Anchor({ href = "#", children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const className =
    "text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors";

  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...props}>
      {children}
    </a>
  );
}

export const mdxComponents = {
  a: Anchor,
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
      {...props}
      loading={props.loading || "lazy"}
      decoding="async"
      className="block h-auto w-full rounded-none border-2 border-border bg-muted"
      alt={props.alt || ""}
    />
  ),
  figure: ({ children }: { children?: React.ReactNode }) => (
    <figure className="w-full">{children}</figure>
  ),
  figcaption: ({ children }: { children?: React.ReactNode }) => (
    <figcaption className="text-sm text-foreground/55">{children}</figcaption>
  ),
  hr: () => <hr className="border-0 border-t-2 border-border" />,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-foreground pl-4 text-foreground/70">
      {children}
    </blockquote>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="overflow-x-auto border-2 border-border bg-muted p-4 text-sm text-foreground">
      {children}
    </pre>
  ),
  code: ({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
    const isCodeBlock = className?.includes("language-");

    if (isCodeBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return (
      <code className="border border-border bg-muted px-1.5 py-0.5 text-[0.95em]" {...props}>
        {children}
      </code>
    );
  },
  table: ({ children }: { children?: React.ReactNode }) => (
    <table className="w-full border-collapse text-left text-sm">{children}</table>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b-2 border-border">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b border-border last:border-b-0">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 font-medium text-foreground">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 text-foreground/70">{children}</td>
  ),
};
