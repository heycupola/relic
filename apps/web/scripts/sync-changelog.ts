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
const EXPECTED_RELEASE_TAG = process.env.EXPECTED_RELEASE_TAG;
const RELEASE_FETCH_RETRIES = Math.max(1, Number(process.env.RELEASE_FETCH_RETRIES ?? 6));
const RELEASE_FETCH_RETRY_DELAY_MS = Math.max(
  0,
  Number(process.env.RELEASE_FETCH_RETRY_DELAY_MS ?? 5000),
);
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
    .map((line) => {
      if (!line || line === "---") return "";
      if (line.startsWith("#")) {
        return "";
      }

      if (line.startsWith("-") || line.startsWith("*")) {
        return line
          .replace(/^[-*]\s+/, "")
          .replace(/^(\[[^\]]+\]\([^)]+\)\s*)+/, "")
          .replace(/^`[^`]+`\s*/, "")
          .replace(/^Thanks\s+\[[^\]]+\]\([^)]+\)!?\s*-\s*/, "")
          .replace(/^[a-f0-9]{7,40}:\s+/i, "")
          .replace(/^#{1,6}\s+/, "")
          .trim();
      }

      if (/^[^:]{1,80}:$/.test(line)) {
        return "";
      }

      return line;
    })
    .filter(Boolean);

  const candidate = lines[0];
  if (!candidate) {
    return `${release.name || release.tag_name} release notes for relic.`;
  }

  if (candidate.length <= 180) {
    return candidate;
  }

  const truncated = candidate.slice(0, 177).trimEnd();
  const safeTruncated = truncated.slice(0, Math.max(truncated.lastIndexOf(" "), 0)).trimEnd();
  return `${safeTruncated || truncated}...`;
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
  for (let attempt = 1; attempt <= RELEASE_FETCH_RETRIES; attempt += 1) {
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
    const publishedReleases = releases.filter((release) => !release.draft && release.published_at);

    if (
      !EXPECTED_RELEASE_TAG ||
      publishedReleases.some((release) => release.tag_name === EXPECTED_RELEASE_TAG)
    ) {
      return publishedReleases;
    }

    if (attempt < RELEASE_FETCH_RETRIES) {
      console.warn(
        `Release ${EXPECTED_RELEASE_TAG} is not visible in the GitHub Releases API yet (attempt ${attempt}/${RELEASE_FETCH_RETRIES}). Retrying...`,
      );
      await new Promise((resolve) => setTimeout(resolve, RELEASE_FETCH_RETRY_DELAY_MS));
      continue;
    }

    throw new Error(
      `Expected release ${EXPECTED_RELEASE_TAG} was not found in the GitHub Releases API after ${RELEASE_FETCH_RETRIES} attempts.`,
    );
  }
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
