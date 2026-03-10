import { redirect } from "next/navigation";
import { getChangelogEntries } from "@/lib/content";

interface ChangelogEntryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const entries = await getChangelogEntries();
  return entries.map((entry) => ({ slug: entry.slug }));
}

export default async function ChangelogEntryPage({ params }: ChangelogEntryPageProps) {
  const { slug } = await params;
  redirect(`/changelog#${slug}`);
}
