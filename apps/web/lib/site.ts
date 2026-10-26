import { EXTRA_COLLABORATOR_PRICE_USD, PRO_COLLABORATORS_PER_PROJECT } from "./plans";

export { SITE_DESCRIPTION, SITE_SLOGAN, SITE_TITLE } from "./site-copy";

export const SITE_NAME = "Relic";
export const SITE_BRAND_NAME = "Relic";
export const SITE_URL = "https://withrelic.com";
export const SITE_AUTHOR = "Cupola";
export const SITE_AUTHOR_URL = "https://cupo.la";
export const SITE_TWITTER_HANDLE = "@heycupola";
export const SITE_GITHUB_URL = "https://github.com/heycupola/relic";
export const SITE_RELEASES_URL = `${SITE_GITHUB_URL}/releases`;
export const SITE_DOCS_URL = "https://docs.withrelic.com";
export const SITE_X_URL = "https://x.com/heycupola";
export const SITE_DISCORD_URL = "https://discord.gg/2vNRzRMY6K";
export const SITE_STATUS_URL = "https://status.withrelic.com";
export const ENTERPRISE_URL =
  process.env.NEXT_PUBLIC_ENTERPRISE_URL || "https://form.typeform.com/to/JJ4KTKd7";
export const BLOG_PATH = "/blog";
export const CHANGELOG_PATH = "/changelog";
export const BLOG_TITLE = "Blog";
export const BLOG_DESCRIPTION =
  "Product notes, design decisions, and technical writing about building Relic.";
export const CHANGELOG_TITLE = "Changelog";
export const CHANGELOG_DESCRIPTION =
  "Release notes, product improvements, and shipping updates from Relic.";
export const BLOG_FEED_PATH = "/blog/rss.xml";
export const CHANGELOG_FEED_PATH = "/changelog/rss.xml";
export const SITE_KEYWORDS = [
  "secret manager",
  "secrets management",
  "end-to-end encrypted secrets",
  "client-side encryption",
  "zero-knowledge",
  "encryption",
  "environment variables",
  "dotenv alternative",
  "no .env files",
  "MCP server",
  "AI agent secrets",
  "Cursor secrets",
  "Claude Code secrets",
  "Vercel env sync",
  "Cloudflare Workers secrets",
  "Doppler alternative",
  "Infisical alternative",
  "dotenvx alternative",
  "CLI",
  "TUI",
  "CI/CD",
  "OIDC",
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
      "No. Every secret is encrypted on your device before it leaves your machine. Our servers only store ciphertext, and we cannot read or decrypt your values.",
  },
  {
    question: "Can I use Relic with my existing .env files?",
    answer:
      "Yes. You can paste .env contents directly into the TUI editor (just like Vim/Nano) or run relic import to bring in .env, JSON, Doppler, Infisical, Vercel, or 1Password secrets in seconds. From there, your variables are backed up with end-to-end encryption and ready to inject anywhere.",
  },
  {
    question: "How does Relic keep secrets safe from AI coding agents like Cursor or Claude Code?",
    answer:
      "When you inject secrets at runtime with relic run or our built-in MCP server (relic mcp), you don't need plaintext .env files sitting in your project folder where AI assistants can read or index them. Through MCP, AI agents can inspect key names and run tests or scripts with secrets injected while actual values are automatically redacted from output.",
  },
  {
    question: "How is Relic different from Doppler, Infisical, or plain .env files?",
    answer:
      "Plain .env files are easy to lose, risky to share over Slack, and readable by any local process or AI tool, while traditional cloud secret managers can decrypt your data on their servers. Relic gives you the familiar .env editing experience in the terminal, but encrypts everything on your device, injects secrets in memory via a Rust runner, and includes leak guard, platform sync, and an MCP server out of the box.",
  },
  {
    question:
      "Can I push secrets directly to Vercel, Cloudflare Workers, GitHub Actions, or Fly.io?",
    answer:
      "Yes. Run relic push to decrypt an environment locally and sync it straight to your deployment platform's API or CLI with a clear diff plan (+, ~, -). Plaintext values never pass through our servers.",
  },
  {
    question: "Can I share secrets with my team?",
    answer: `Yes, project sharing is a Pro feature. Invite teammates by email and they get access to the project, with ${PRO_COLLABORATORS_PER_PROJECT} collaborators per project included and $${EXTRA_COLLABORATOR_PRICE_USD}/month per extra collaborator. Each person's access is wrapped with their own public key, so sharing stays end-to-end encrypted.`,
  },
  {
    question: "Can I use Relic in CI/CD pipelines?",
    answer:
      "Yes, with Pro. Service accounts, OIDC trust policies, and API keys let you inject secrets in GitHub Actions, GitLab CI, or any pipeline without sharing personal credentials.",
  },
  {
    question: "Do my secrets sync across devices and languages?",
    answer:
      "Yes. Encrypted secrets sync automatically across macOS, Linux, and Windows, and relic run works with any language or framework, including Node.js, Bun, Python, Go, Rust, and Docker.",
  },
] as const;

export function getAbsoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
