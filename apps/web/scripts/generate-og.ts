import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateOgPng } from "../lib/og-image";

const OUT_DIR = join(process.cwd(), "public", "og");

interface OgVariant {
  filename: string;
  eyebrow: string;
  title: string;
  description: string;
  footer?: string;
}

async function getContentEntries(): Promise<OgVariant[]> {
  const variants: OgVariant[] = [];

  const contentDir = join(process.cwd(), "content");
  const { readdir, readFile } = await import("node:fs/promises");
  const matter = (await import("gray-matter")).default;

  for (const collection of ["blog", "changelog"] as const) {
    const dir = join(contentDir, collection);
    if (!existsSync(dir)) continue;

    const scan = async (d: string): Promise<string[]> => {
      const entries = await readdir(d, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = join(d, e.name);
        if (e.isDirectory()) files.push(...(await scan(full)));
        else if (/\.(md|mdx)$/.test(e.name)) files.push(full);
      }
      return files;
    };

    const files = await scan(dir);
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      const { data } = matter(source);
      if (data.published === false) continue;

      const slug = file
        .split("/")
        .pop()!
        .replace(/\.(md|mdx)$/, "");
      const title = String(data.title || slug);
      const description = String(data.description || "");

      if (collection === "blog") {
        variants.push({
          filename: `blog-${slug}.png`,
          eyebrow: "Blog",
          title,
          description,
        });
      } else {
        const version = String(data.version || title);
        const date = data.date ? new Date(data.date) : null;
        const formattedDate = date
          ? new Intl.DateTimeFormat("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }).format(date)
          : "";
        variants.push({
          filename: `changelog-${slug}.png`,
          eyebrow: `Changelog · ${version}`,
          title: description || title,
          description: formattedDate,
        });
      }
    }
  }

  return variants;
}

async function main() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const staticVariants: OgVariant[] = [
    {
      filename: "home.png",
      eyebrow: "relic",
      title: "The secrets layer developers actually trust",
      description:
        "Manage and share secrets. Encrypted on your device, never exposed to anyone else. Not even us.",
    },
    {
      filename: "blog-index.png",
      eyebrow: "Blog",
      title: "Blog",
      description: "Product notes, design decisions, and technical writing about building relic.",
    },
    {
      filename: "changelog-index.png",
      eyebrow: "Changelog",
      title: "Changelog",
      description: "Release notes, product improvements, and shipping updates from relic.",
    },
  ];

  const contentVariants = await getContentEntries();
  const allVariants = [...staticVariants, ...contentVariants];

  console.log(`Generating ${allVariants.length} OG images...`);

  for (const variant of allVariants) {
    const png = await generateOgPng(variant);
    const outPath = join(OUT_DIR, variant.filename);
    writeFileSync(outPath, png);
    console.log(`  ✓ ${variant.filename}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed to generate OG images:", err);
  process.exit(1);
});
