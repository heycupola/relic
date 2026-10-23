import Link from "next/link";
import type React from "react";
import { CodeBlock } from "@/components/code-block";

const linkClassName =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function Anchor({ href = "#", children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={linkClassName}>
        {children}
      </Link>
    );
  }

  const isExternal = /^https?:\/\//i.test(href);

  return (
    <a
      href={href}
      {...(isExternal && { target: "_blank", rel: "noopener noreferrer" })}
      className={linkClassName}
      {...props}
    >
      {children}
    </a>
  );
}

function Pre({ children }: { children?: React.ReactNode }) {
  const child = children as React.ReactElement<{ className?: string }> | undefined;
  const language = /language-([\w-]+)/.exec(child?.props?.className ?? "")?.[1];
  return <CodeBlock language={language}>{children}</CodeBlock>;
}

function Code({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  if (className?.includes("language-")) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const isShort = typeof children === "string" && children.length <= 24;

  return (
    <code
      className={`border border-border bg-muted/60 px-1 py-px font-mono text-[0.85em] text-foreground ${isShort ? "whitespace-nowrap" : ""}`}
      {...props}
    >
      {children}
    </code>
  );
}

function createAnchoredHeading(Tag: "h2" | "h3") {
  return function AnchoredHeading({
    id,
    children,
  }: React.HTMLAttributes<HTMLHeadingElement> & { children?: React.ReactNode }) {
    if (!id) return <Tag>{children}</Tag>;

    return (
      <Tag id={id} className="group scroll-mt-24">
        <a
          href={`#${id}`}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {children}
          <span
            aria-hidden="true"
            className="ml-2 font-mono text-[0.7em] font-normal text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          >
            #
          </span>
        </a>
      </Tag>
    );
  };
}

function SectionLabel({ children }: { children?: React.ReactNode }) {
  return <h3 className="changelog-label">{children}</h3>;
}

const sharedComponents = {
  a: Anchor,
  pre: Pre,
  code: Code,
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
      {...props}
      loading={props.loading || "lazy"}
      decoding="async"
      className="block h-auto w-full border-2 border-border bg-muted"
      alt={props.alt || ""}
    />
  ),
  figure: ({ children }: { children?: React.ReactNode }) => (
    <figure className="w-full">{children}</figure>
  ),
  figcaption: ({ children }: { children?: React.ReactNode }) => (
    <figcaption className="text-sm text-foreground/65">{children}</figcaption>
  ),
  hr: () => <hr className="border-0 border-t border-border" />,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-foreground pl-4 text-foreground/70">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto border-2 border-border">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b-2 border-border bg-muted/40">{children}</thead>
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

export const articleComponents = {
  ...sharedComponents,
  h2: createAnchoredHeading("h2"),
  h3: createAnchoredHeading("h3"),
};

export const changelogComponents = {
  ...sharedComponents,
  h2: SectionLabel,
  h3: SectionLabel,
  h4: SectionLabel,
};
