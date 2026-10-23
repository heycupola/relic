import "server-only";

import { evaluate } from "@mdx-js/mdx";
import React from "react";
import * as runtime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import { articleComponents, changelogComponents } from "./mdx-components";
import { slugify } from "./slug";

type MdxModule = {
  default: React.ComponentType<{ components?: Record<string, React.ElementType> }>;
};

type MdxVariant = "article" | "changelog";

export interface MdxHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function getText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(getText).join("");
}

function rehypeCollectHeadings(headings: MdxHeading[]) {
  return () => (tree: HastNode) => {
    const used = new Map<string, number>();

    const visit = (node: HastNode) => {
      if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) {
        const text = getText(node).trim();
        const base = slugify(text) || "section";
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        node.properties = { ...node.properties, id };
        headings.push({ id, text, level: node.tagName === "h2" ? 2 : 3 });
        return;
      }
      node.children?.forEach(visit);
    };

    visit(tree);
  };
}

export async function renderMdx(
  source: string,
  { variant = "article" }: { variant?: MdxVariant } = {},
): Promise<{ content: React.ReactNode; headings: MdxHeading[] }> {
  const headings: MdxHeading[] = [];
  const components = variant === "changelog" ? changelogComponents : articleComponents;

  const module = (await evaluate(source, {
    ...runtime,
    Fragment: React.Fragment,
    useMDXComponents: () => components,
    remarkPlugins: [remarkGfm],
    rehypePlugins: variant === "article" ? [rehypeCollectHeadings(headings)] : [],
    development: process.env.NODE_ENV === "development",
  })) as MdxModule;

  const Content = module.default;

  return { content: <Content components={components} />, headings };
}
