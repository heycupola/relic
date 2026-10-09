"use client";

import { cn } from "@repo/ui/lib/utils";
import { FolderKanban, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, pluralize } from "@/lib/format";
import { focusRing } from "@/lib/styles";
import {
  CopyButton,
  DashboardCard,
  EmptyState,
  SegmentedTabs,
  StatusLabel,
  type Tone,
  thinScrollbar,
} from "./primitives";

export type ProjectStatus = "owned" | "shared" | "restricted" | "archived";

export interface DashboardProject {
  id: string;
  name: string;
  status: ProjectStatus;
  isOwner: boolean;
  shareCount: number;
  ownerName?: string;
  /** Created at for owned projects, shared at for projects shared with you. */
  since?: number;
}

type Filter = "all" | "mine" | "shared" | "archived";

const STATUS_META: Record<ProjectStatus, { label: string; tone: Tone }> = {
  owned: { label: "active", tone: "success" },
  shared: { label: "shared", tone: "info" },
  restricted: { label: "locked", tone: "warning" },
  archived: { label: "archived", tone: "muted" },
};

const SEARCH_THRESHOLD = 6;

function matchesFilter(project: DashboardProject, filter: Filter) {
  const archived = project.status === "archived";
  switch (filter) {
    case "all":
      return !archived;
    case "mine":
      return project.isOwner && !archived;
    case "shared":
      return !project.isOwner && !archived;
    case "archived":
      return archived;
  }
}

export function ProjectsOverviewCard({ projects }: { projects: DashboardProject[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: projects.filter((p) => matchesFilter(p, "all")).length,
      mine: projects.filter((p) => matchesFilter(p, "mine")).length,
      shared: projects.filter((p) => matchesFilter(p, "shared")).length,
      archived: projects.filter((p) => matchesFilter(p, "archived")).length,
    }),
    [projects],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(
      (p) =>
        matchesFilter(p, filter) &&
        (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)),
    );
  }, [projects, filter, query]);

  const hasLocked = projects.some((p) => p.status === "restricted");

  return (
    <DashboardCard
      eyebrow="projects"
      title="Your projects"
      description="Everything you own or can access. Open the TUI to edit secrets."
      footer={
        <span>
          Manage projects from your terminal with{" "}
          <code className="font-mono text-foreground">relic</code>
          {hasLocked && " · Locked projects are over your plan limit"}
        </span>
      }
      bodyClassName="p-0 sm:p-0"
    >
      {projects.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState icon={FolderKanban} title="No projects yet">
            Run <code className="font-mono text-foreground">relic</code> and create your first
            project. It will show up here right away.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <SegmentedTabs
              label="Filter projects"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "mine", label: "Mine", count: counts.mine },
                { value: "shared", label: "Shared with me", count: counts.shared },
                { value: "archived", label: "Archived", count: counts.archived },
              ]}
            />
            {projects.length > SEARCH_THRESHOLD && (
              <label className="relative block sm:w-48">
                <span className="sr-only">Search projects</span>
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full border border-border bg-background py-1.5 pr-2.5 pl-8 text-xs text-foreground placeholder:text-muted-foreground transition-colors hover:border-foreground/50 focus-visible:border-foreground focus-visible:outline-none"
                />
              </label>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
              {query
                ? `No projects match “${query.trim()}”.`
                : filter === "archived"
                  ? "No archived projects."
                  : filter === "shared"
                    ? "Nobody has shared a project with you yet."
                    : "No active projects. Unarchive one from the TUI."}
            </p>
          ) : (
            <ul
              className={cn("max-h-[360px] divide-y divide-border overflow-y-auto", thinScrollbar)}
            >
              {visible.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </ul>
          )}
        </>
      )}
    </DashboardCard>
  );
}

function ProjectRow({ project }: { project: DashboardProject }) {
  const meta = STATUS_META[project.status];
  const shortId = project.id.length > 10 ? `${project.id.slice(0, 10)}…` : project.id;

  const details: string[] = [];
  if (!project.isOwner && project.ownerName) details.push(`by ${project.ownerName}`);
  if (project.isOwner && project.shareCount > 0)
    details.push(pluralize(project.shareCount, "collaborator"));
  if (project.since)
    details.push(`${project.isOwner ? "created" : "shared"} ${formatDate(project.since)}`);

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 sm:px-5",
        project.status === "archived" && "opacity-70",
      )}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center border border-border bg-muted/30 font-mono text-xs font-medium uppercase text-foreground/70"
        aria-hidden="true"
      >
        {project.name.slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
          <StatusLabel status={meta.label} toneName={meta.tone} />
        </div>
        {details.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
        )}
      </div>
      <CopyButton
        value={project.id}
        label={`Copy project ID for ${project.name}`}
        className={`hidden border border-transparent px-2 py-1 font-mono text-[11px] hover:border-border sm:inline-flex ${focusRing}`}
      >
        {shortId}
      </CopyButton>
      <CopyButton
        value={project.id}
        label={`Copy project ID for ${project.name}`}
        className="p-1.5 sm:hidden"
      />
    </li>
  );
}
