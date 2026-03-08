import { SITE_DESCRIPTION, SITE_SLOGAN, SITE_TITLE } from "./site-copy";

export { SITE_DESCRIPTION, SITE_SLOGAN, SITE_TITLE } from "./site-copy";

export const SITE_NAME = "relic";
export const SITE_BRAND_NAME = "Relic";
export const SITE_URL = "https://relic.so";
export const SITE_AUTHOR = "Cupola Labs";
export const SITE_AUTHOR_URL = "https://cupo.la";
export const SITE_TWITTER_HANDLE = "@heycupola";
export const SITE_GITHUB_URL = "https://github.com/heycupola/relic";
export const SITE_RELEASES_URL = `${SITE_GITHUB_URL}/releases`;
export const SITE_DOCS_URL = "https://docs.relic.so";
export const SITE_X_URL = "https://x.com/heycupola";
export const ENTERPRISE_URL =
  process.env.NEXT_PUBLIC_ENTERPRISE_URL || "https://form.typeform.com/to/JJ4KTKd7";
export const BLOG_PATH = "/blog";
export const CHANGELOG_PATH = "/changelog";
export const BLOG_TITLE = "Blog";
export const BLOG_DESCRIPTION =
  "Product notes, design decisions, and technical writing about building relic.";
export const CHANGELOG_TITLE = "Changelog";
export const CHANGELOG_DESCRIPTION =
  "Release notes, product improvements, and shipping updates from relic.";
export const BLOG_FEED_PATH = "/blog/rss.xml";
export const CHANGELOG_FEED_PATH = "/changelog/rss.xml";
export const SITE_KEYWORDS = [
  "secrets management",
  "zero-knowledge",
  "encryption",
  "environment variables",
  "CLI",
  "TUI",
  "CI/CD",
  "AES-256",
  "Argon2id",
  "dotenv",
] as const;
export const PUBLIC_SITE_ROUTES = [
  "/",
  BLOG_PATH,
  CHANGELOG_PATH,
  "/privacy-policy",
  "/terms-of-service",
  "/dpa",
] as const;
export const SITE_FAQS = [
  {
    question: "Can you see my secrets?",
    answer:
      "No. Your secrets are encrypted on your device before anything is sent to us. We literally cannot read them. Only you hold the keys.",
  },
  {
    question: "Where does my data go?",
    answer:
      "Your secrets are encrypted on your machine, then stored safely on our servers. We only ever see encrypted data, never the real values.",
  },
  {
    question: "How secure is Relic?",
    answer:
      "Very. We use the same encryption standards trusted by banks and governments (AES-256 + Argon2id). Everything is encrypted before it leaves your device.",
  },
  {
    question: "Can I share secrets with my team?",
    answer:
      "Yes, invite teammates by email and they get access to the project. Each person's secrets are encrypted with their own keys, so sharing stays fully secure.",
  },
  {
    question: "Can I use Relic in CI/CD pipelines?",
    answer:
      "Absolutely. The CLI is designed for automation. You can easily integrate Relic into GitHub Actions, GitLab CI, Jenkins, or any other CI/CD system.",
  },
  {
    question: "Do my secrets sync across devices?",
    answer:
      "Yes, automatically. Your encrypted secrets sync through our servers, but since everything is encrypted on your device first, we never see the actual values.",
  },
  {
    question: "Which programming languages are supported?",
    answer:
      "All of them. Relic is completely language agnostic. Any language, any framework. Just use relic run to inject secrets as environment variables into any process.",
  },
] as const;

export function getAbsoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
