"use client";

import { cn } from "@repo/ui/lib/utils";
import { Archive, Check, Lock, Users } from "lucide-react";

interface Project {
  id: string;
  name: string;
  status: "owned" | "shared" | "restricted" | "archived";
  shareCount?: number;
}

interface ProjectsOverviewCardProps {
  projects: Project[];
  projectsUsed: number;
  projectsLimit: number;
  isLoading?: boolean;
}

function getStatusColor(status: Project["status"]) {
  switch (status) {
    case "owned":
      return "text-green-600 dark:text-green-400";
    case "shared":
      return "text-blue-600 dark:text-blue-400";
    case "restricted":
      return "text-yellow-600 dark:text-yellow-400";
    case "archived":
      return "text-foreground/40";
    default:
      return "text-foreground";
  }
}

function getStatusLabel(status: Project["status"]) {
  switch (status) {
    case "owned":
      return "active";
    case "shared":
      return "shared";
    case "restricted":
      return "restricted";
    case "archived":
      return "archived";
    default:
      return status;
  }
}

function getStatusIcon(status: Project["status"]) {
  switch (status) {
    case "owned":
      return Check;
    case "shared":
      return Users;
    case "restricted":
      return Lock;
    case "archived":
      return Archive;
    default:
      return null;
  }
}

export function ProjectsOverviewCard({
  projects,
  projectsUsed,
  projectsLimit,
  isLoading,
}: ProjectsOverviewCardProps) {
  const ownedCount = projects.filter((p) => p.status === "owned").length;
  const sharedCount = projects.filter((p) => p.status === "shared").length;
  const restrictedCount = projects.filter((p) => p.status === "restricted").length;
  const archivedCount = projects.filter((p) => p.status === "archived").length;

  const recentProjects = projects.slice(0, 8);
  const _percentage = projectsLimit > 0 ? Math.min((projectsUsed / projectsLimit) * 100, 100) : 0;

  if (isLoading) {
    return (
      <div className="border-2 border-border bg-card p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-border bg-card p-5">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground/60">Projects</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
          <div>
            <span className="text-foreground/50">active:</span>{" "}
            <span className="text-green-600 dark:text-green-400 tabular-nums">{ownedCount}</span>
          </div>
          <div>
            <span className="text-foreground/50">shared:</span>{" "}
            <span className="text-blue-600 dark:text-blue-400 tabular-nums">{sharedCount}</span>
          </div>
          <div>
            <span className="text-foreground/50">restricted:</span>{" "}
            <span className="text-yellow-600 dark:text-yellow-400 tabular-nums">
              {restrictedCount}
            </span>
          </div>
          <div>
            <span className="text-foreground/50">archived:</span>{" "}
            <span className="text-foreground/40 tabular-nums">{archivedCount}</span>
          </div>
        </div>

        {recentProjects.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground/50">Recent projects</p>
            <div className="relative">
              <ul className="space-y-1 max-h-[280px] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-border/20 [&::-webkit-scrollbar-thumb]:bg-foreground/20 [&::-webkit-scrollbar-thumb]:hover:bg-foreground/30">
                {recentProjects.map((project, index) => {
                  const StatusIcon = getStatusIcon(project.status);
                  return (
                    <li
                      key={project.id}
                      className={cn(
                        "py-2 px-3 border border-border/50 hover:bg-muted/50 transition-colors",
                        index < 5 ? "opacity-100" : "opacity-100",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground text-sm truncate block">
                            {project.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`flex items-center gap-1 text-xs whitespace-nowrap ${getStatusColor(project.status)}`}
                            >
                              {StatusIcon && (
                                <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                              )}
                              {getStatusLabel(project.status)}
                            </span>
                            {project.status === "owned" &&
                              project.shareCount !== undefined &&
                              project.shareCount > 0 && (
                                <>
                                  <span className="text-foreground/30">·</span>
                                  <span className="text-xs text-foreground/50">
                                    <span className="tabular-nums">{project.shareCount}</span>{" "}
                                    {project.shareCount === 1 ? "collaborator" : "collaborators"}
                                  </span>
                                </>
                              )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {recentProjects.length > 5 && (
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
