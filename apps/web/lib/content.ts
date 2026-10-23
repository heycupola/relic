import "server-only";

import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { cache } from "react";
import { SITE_AUTHOR } from "./site";

export type ContentCollection = "blog" | "changelog";

type CollectionFrontmatter = Record<string, unknown>;

interface BaseContentEntry {
  slug: string;
  title: string;
  description: string;
  body: string;
  href: string;
  ogImagePath: string;
  date: string;
  isoDate: string;
  formattedDate: string;
  sortDate: number;
  published: boolean;
  featured: boolean;
  tags: string[];
  excerpt: string;
  readingTimeMinutes: number;
  readingTimeText: string;
}

export interface BlogPost extends BaseContentEntry {
  collection: "blog";
  author: string;
  category: string;
}

export type ReleaseType = "major" | "minor" | "patch";

/** Plain-text length above which changelog entries collapse with “View all”. */
export const CHANGELOG_COLLAPSE_PLAIN_TEXT_LIMIT = 720;

export interface ChangelogEntry extends BaseContentEntry {
  collection: "changelog";
  version: string;
  releaseType?: ReleaseType;
  deprecated: boolean;
  bodyPlainLength: number;
  collapsible: boolean;
  releaseUrl?: string;
  githubTag?: string;
}

export type ContentEntry = BlogPost | ChangelogEntry;

const CONTENT_ROOT = path.join(process.cwd(), "content");
const COLLECTION_DIRECTORIES: Record<ContentCollection, string> = {
  blog: path.join(CONTENT_ROOT, "blog"),
  changelog: path.join(CONTENT_ROOT, "changelog"),
};
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function getCollectionHref(collection: ContentCollection, slug: string): string {
  return collection === "blog" ? `/blog/${slug}` : `/changelog/${slug}`;
}

function getCollectionOgImagePath(
  collection: ContentCollection,
  title: string,
  description: string,
  footer?: string,
): string {
  const params = new URLSearchParams({
    type: `${collection}-entry`,
    title,
    description,
  });
  if (footer) params.set("footer", footer);
  return `/og?${params.toString()}`;
}

function ensureString(value: unknown, field: string, slug: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required "${field}" frontmatter in content entry "${slug}".`);
  }

  return value.trim();
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim());
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function stripMarkdown(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toExcerpt(body: string, description: string): string {
  const stripped = stripMarkdown(body);
  if (!stripped) return description;
  if (stripped.length <= 180) return stripped;
  return `${stripped.slice(0, 177).trimEnd()}...`;
}

function getReadingTimeMinutes(body: string): number {
  const stripped = stripMarkdown(body);
  const words = stripped ? stripped.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(words / 220));
}

function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}

async function getMarkdownFiles(directory: string): Promise<string[]> {
  let directoryEntries: Dirent<string>[];
  try {
    directoryEntries = await fs.readdir(directory, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const nested = await Promise.all(
    directoryEntries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return getMarkdownFiles(fullPath);
      }

      return /\.(md|mdx)$/.test(entry.name) ? [fullPath] : [];
    }),
  );

  return nested.flat();
}

function parseDate(rawDate: string, slug: string): Date {
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid "date" frontmatter value in content entry "${slug}".`);
  }

  return parsed;
}

function normalizeDateInput(value: unknown, slug: string): { raw: string; parsed: Date } {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Invalid "date" frontmatter value in content entry "${slug}".`);
    }

    return {
      raw: value.toISOString().slice(0, 10),
      parsed: value,
    };
  }

  const raw = ensureString(value, "date", slug);
  return {
    raw,
    parsed: parseDate(raw, slug),
  };
}

function normalizeBaseEntry(
  collection: ContentCollection,
  slug: string,
  data: CollectionFrontmatter,
  body: string,
): BaseContentEntry {
  const title = ensureString(data.title, "title", slug);
  const description = ensureString(data.description, "description", slug);
  const normalizedDate = normalizeDateInput(data.date, slug);
  const readingTimeMinutes = getReadingTimeMinutes(body);

  const formattedDate = DATE_FORMATTER.format(normalizedDate.parsed);
  const readingTimeText = formatReadingTime(readingTimeMinutes);
  const ogFooter =
    collection === "blog" ? `${formattedDate}  ·  ${readingTimeText}` : formattedDate;

  return {
    slug,
    title,
    description,
    body: body.trim(),
    href: getCollectionHref(collection, slug),
    ogImagePath: getCollectionOgImagePath(collection, title, description, ogFooter),
    date: normalizedDate.raw,
    isoDate: normalizedDate.parsed.toISOString(),
    formattedDate,
    sortDate: normalizedDate.parsed.getTime(),
    published: toBoolean(data.published, true),
    featured: toBoolean(data.featured, false),
    tags: toStringArray(data.tags),
    excerpt: toExcerpt(body, description),
    readingTimeMinutes,
    readingTimeText,
  };
}

const DEPRECATED_TITLE_PATTERN = /^\[deprecated\]\s*/i;
const DEPRECATION_NOTICE_PATTERN =
  /^## Deprecated\s*\n+This release is deprecated and no longer supported\.\s*\n+(?:Versions before [^\n]+\n(?:Please use [^\n]+\n)?)?/m;
const RELEASE_LINK_FOOTER_PATTERN = /\n*(?:---\s*\n+)?\[View release on GitHub\]\([^)]+\)\s*$/;
const COMMIT_PREFIX_PATTERN = /^(\s*[-*]\s+)[a-f0-9]{7,40}:\s+/gm;
const LEADING_RULE_PATTERN = /^(?:\s*---\s*\n)+/;

function getReleaseType(version: string): ReleaseType | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return undefined;
  const [, major, minor, patch] = match;
  if (patch !== "0") return "patch";
  if (minor !== "0" || major === "0") return "minor";
  return "major";
}

/**
 * Bolds the first sentence of long top-level bullets so release notes can be scanned
 * by their summary line. Skips sentences whose inline markdown would be split.
 */
function emphasizeLeadSentences(body: string): string {
  const lines = body.split("\n");

  return lines
    .map((line, index) => {
      const match = /^([-*]\s+)(.+)$/.exec(line);
      if (!match) return line;
      const [, marker, text] = match as unknown as [string, string, string];
      if (text.startsWith("**")) return line;

      const end = text.search(/[.!?](?=\s+[A-Z`(])/);
      const hasNestedList = /^\s+[-*]\s+/.test(
        lines.slice(index + 1).find((next) => next.trim()) ?? "",
      );
      if (end === -1 && !hasNestedList) return line;

      const lead = end === -1 ? text : text.slice(0, end + 1);
      const rest = end === -1 ? "" : text.slice(end + 1);
      const backticks = lead.match(/`/g)?.length ?? 0;
      if (lead.length > 160 || backticks % 2 !== 0 || /[*[\]]/.test(lead)) return line;
      return `${marker}**${lead}**${rest}`;
    })
    .join("\n");
}

function normalizeChangelogBody(body: string): string {
  const cleaned = body
    .replace(DEPRECATION_NOTICE_PATTERN, "")
    .replace(RELEASE_LINK_FOOTER_PATTERN, "")
    .replace(COMMIT_PREFIX_PATTERN, "$1")
    .replace(LEADING_RULE_PATTERN, "")
    .replace(/\n\s*---\s*$/, "")
    .trim();
  return emphasizeLeadSentences(cleaned);
}

function parseEntry(collection: ContentCollection, fileName: string, source: string): ContentEntry {
  const slug = fileName.replace(/\.(md|mdx)$/, "");
  const { data, content } = matter(source);
  const base = normalizeBaseEntry(collection, slug, data, content);

  if (collection === "blog") {
    return {
      ...base,
      collection: "blog",
      author: toOptionalString(data.author) ?? SITE_AUTHOR,
      category: toOptionalString(data.category) ?? "Journal",
    };
  }

  const version =
    toOptionalString(data.version) ?? base.title.replace(DEPRECATED_TITLE_PATTERN, "");
  const changelogBody = normalizeChangelogBody(base.body);
  const bodyPlainLength = stripMarkdown(changelogBody).length;

  return {
    ...base,
    collection: "changelog",
    body: changelogBody,
    version,
    releaseType: getReleaseType(version),
    deprecated:
      DEPRECATED_TITLE_PATTERN.test(base.title) || DEPRECATION_NOTICE_PATTERN.test(content),
    bodyPlainLength,
    collapsible: bodyPlainLength > CHANGELOG_COLLAPSE_PLAIN_TEXT_LIMIT,
    releaseUrl: toOptionalString(data.releaseUrl),
    githubTag: toOptionalString(data.githubTag),
  };
}

const getCollectionEntries = cache(
  async (collection: ContentCollection): Promise<ContentEntry[]> => {
    const directory = COLLECTION_DIRECTORIES[collection];
    const files = await getMarkdownFiles(directory);

    const loadedEntries = await Promise.all(
      files.map(async (fullPath) => {
        const source = await fs.readFile(fullPath, "utf8");
        return parseEntry(collection, path.basename(fullPath), source);
      }),
    );

    return loadedEntries
      .filter((entry) => entry.published)
      .sort((left, right) => right.sortDate - left.sortDate);
  },
);

export async function getBlogPosts(): Promise<BlogPost[]> {
  const entries = await getCollectionEntries("blog");
  return entries.filter((entry): entry is BlogPost => entry.collection === "blog");
}

export async function getChangelogEntries(): Promise<ChangelogEntry[]> {
  const entries = await getCollectionEntries("changelog");
  return entries.filter((entry): entry is ChangelogEntry => entry.collection === "changelog");
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getBlogPosts();
  return posts.find((post) => post.slug === slug);
}

export async function getChangelogEntryBySlug(slug: string): Promise<ChangelogEntry | undefined> {
  const entries = await getChangelogEntries();
  return entries.find((entry) => entry.slug === slug);
}

export async function getAdjacentBlogPosts(slug: string): Promise<{
  previous?: BlogPost;
  next?: BlogPost;
}> {
  const posts = await getBlogPosts();
  const index = posts.findIndex((post) => post.slug === slug);

  if (index === -1) return {};

  return {
    previous: posts[index + 1],
    next: posts[index - 1],
  };
}

export async function getAdjacentChangelogEntries(slug: string): Promise<{
  previous?: ChangelogEntry;
  next?: ChangelogEntry;
}> {
  const entries = await getChangelogEntries();
  const index = entries.findIndex((entry) => entry.slug === slug);

  if (index === -1) return {};

  return {
    previous: entries[index + 1],
    next: entries[index - 1],
  };
}

export async function getAllPublicContentRoutes(): Promise<string[]> {
  const [blogPosts, changelogEntries] = await Promise.all([getBlogPosts(), getChangelogEntries()]);

  return [...blogPosts.map((post) => post.href), ...changelogEntries.map((entry) => entry.href)];
}
