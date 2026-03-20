import fs from "node:fs/promises";
import path from "node:path";

type GitHubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
};

const REPO = process.env.GITHUB_REPOSITORY || "heycupola/relic";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OUTPUT_DIRECTORY = path.join(process.cwd(), "content", "changelog", "generated");

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractDescription(release: GitHubRelease): string {
  if (!release.body?.trim()) {
    return `${release.name || release.tag_name} release notes for relic.`;
  }

  const lines = release.body
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line && !line.startsWith("#") && !line.startsWith("-") && !line.startsWith("*"),
    );

  const candidate = lines[0];
  if (!candidate) {
    return `${release.name || release.tag_name} release notes for relic.`;
  }

  return candidate.length > 180 ? `${candidate.slice(0, 177).trimEnd()}...` : candidate;
}

function formatBody(release: GitHubRelease): string {
  const originalBody = release.body?.trim();
  if (originalBody) {
    return `${originalBody}\n\n---\n\n[View release on GitHub](${release.html_url})`;
  }

  return `## Highlights\n\n- Published ${release.name || release.tag_name}.\n\n[View release on GitHub](${release.html_url})`;
}

function escapeFrontmatter(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function buildFrontmatter(release: GitHubRelease): string {
  if (!release.published_at) {
    throw new Error(`Release ${release.tag_name} is missing published_at.`);
  }

  const title = release.name || release.tag_name;
  const tags = ["release", release.prerelease ? "prerelease" : "stable"];

  return [
    "---",
    `title: ${escapeFrontmatter(title)}`,
    `description: ${escapeFrontmatter(extractDescription(release))}`,
    `date: "${release.published_at}"`,
    `version: ${escapeFrontmatter(release.tag_name)}`,
    `releaseUrl: ${escapeFrontmatter(release.html_url)}`,
    `githubTag: ${escapeFrontmatter(release.tag_name)}`,
    "tags:",
    ...tags.map((tag) => `  - ${tag}`),
    "published: true",
    "---",
  ].join("\n");
}

async function fetchReleases(): Promise<GitHubRelease[]> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "relic-changelog-sync",
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch releases for ${REPO}: ${response.status} ${response.statusText}. Set GITHUB_TOKEN if the repository is private.`,
    );
  }

  const releases = (await response.json()) as GitHubRelease[];
  return releases.filter((release) => !release.draft && release.published_at);
}

async function writeReleaseFiles(releases: GitHubRelease[]) {
  await fs.rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });

  await Promise.all(
    releases.map(async (release) => {
      const publishedAt = release.published_at?.slice(0, 10);
      if (!publishedAt) return;

      const fileName = `${publishedAt}-${slugify(release.tag_name)}.mdx`;
      const source = `${buildFrontmatter(release)}\n\n${formatBody(release)}\n`;
      await fs.writeFile(path.join(OUTPUT_DIRECTORY, fileName), source, "utf8");
    }),
  );
}

async function main() {
  const releases = await fetchReleases();
  await writeReleaseFiles(releases);
  console.log(
    `Synced ${releases.length} GitHub release${releases.length === 1 ? "" : "s"} into ${OUTPUT_DIRECTORY}.`,
  );
}

await main();
