import type { Metadata } from "next";
import type { ContentEntry } from "./content";
import {
  BLOG_DESCRIPTION,
  BLOG_FEED_PATH,
  BLOG_TITLE,
  CHANGELOG_DESCRIPTION,
  CHANGELOG_FEED_PATH,
  CHANGELOG_TITLE,
  getAbsoluteUrl,
  SITE_NAME,
  SITE_TWITTER_HANDLE,
} from "./site";

interface CollectionMetadataOptions {
  title: string;
  description: string;
  path: string;
  imagePath: string;
  feedPath: string;
}

export function getCollectionMetadata({
  title,
  description,
  path,
  imagePath,
  feedPath,
}: CollectionMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
      types: {
        "application/rss+xml": getAbsoluteUrl(feedPath),
      },
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: path,
      siteName: SITE_NAME,
      title: `${title} - relic`,
      description,
      images: [
        {
          url: getAbsoluteUrl(imagePath),
          width: 1200,
          height: 630,
          alt: `${title} - relic`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - relic`,
      description,
      creator: SITE_TWITTER_HANDLE,
      site: SITE_TWITTER_HANDLE,
      images: [getAbsoluteUrl(imagePath)],
    },
  };
}

export function getBlogMetadata(): Metadata {
  return getCollectionMetadata({
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    path: "/blog",
    imagePath: "/og?type=blog-index",
    feedPath: BLOG_FEED_PATH,
  });
}

export function getChangelogMetadata(): Metadata {
  return getCollectionMetadata({
    title: CHANGELOG_TITLE,
    description: CHANGELOG_DESCRIPTION,
    path: "/changelog",
    imagePath: "/og?type=changelog-index",
    feedPath: CHANGELOG_FEED_PATH,
  });
}

export function getEntryMetadata(entry: ContentEntry): Metadata {
  return {
    title: entry.title,
    description: entry.description,
    alternates: {
      canonical: entry.href,
    },
    openGraph: {
      type: entry.collection === "blog" ? "article" : "website",
      locale: "en_US",
      url: entry.href,
      siteName: SITE_NAME,
      title: `${entry.title} - relic`,
      description: entry.description,
      publishedTime: entry.isoDate,
      images: [
        {
          url: getAbsoluteUrl(entry.ogImagePath),
          width: 1200,
          height: 630,
          alt: entry.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${entry.title} - relic`,
      description: entry.description,
      creator: SITE_TWITTER_HANDLE,
      site: SITE_TWITTER_HANDLE,
      images: [getAbsoluteUrl(entry.ogImagePath)],
    },
  };
}
