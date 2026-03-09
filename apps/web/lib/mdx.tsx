import "server-only";

import { evaluate } from "@mdx-js/mdx";
import React from "react";
import * as runtime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import { mdxComponents } from "./mdx-components";

type MdxModule = {
  default: React.ComponentType<{ components?: Record<string, React.ElementType> }>;
};

export async function renderMdx(source: string) {
  const module = (await evaluate(source, {
    ...runtime,
    Fragment: React.Fragment,
    useMDXComponents: () => mdxComponents,
    remarkPlugins: [remarkGfm],
    development: process.env.NODE_ENV === "development",
  })) as MdxModule;

  const Content = module.default;

  return <Content components={mdxComponents} />;
}
