/** @jsxImportSource @opentui/react */
import { useEffect, useState } from "react";
import type { useListNavigation } from "../../hooks/useListNavigation";
import type { Project } from "../../types/models";
import {
  SPINNER_FRAMES,
  SPINNER_INTERVAL,
  STATUS_COLORS,
  STATUS_ICONS,
  THEME_COLORS,
} from "../../utils/constants";
import { truncate } from "../../utils/ui";
import { InlineInput } from "../forms/InlineInput";
import { DeleteConfirmation } from "../shared/DeleteConfirmation";
import { MoreItems } from "../shared/MoreItems";

const LIST_WIDTH = 52;
// NOTE: Leaves room for the cursor and the "[restricted] Ø" label on the right.
const MAX_NAME_LENGTH = LIST_WIDTH - 18;

interface ProjectRef {
  id: string;
  name: string;
}

interface ProjectListProps {
  projects: Project[];
  isLoading: boolean;
  archivedCount: number;
  pageSize: number;
  navigation: ReturnType<typeof useListNavigation<Project>>;
  isCreating: boolean;
  editingProject: ProjectRef | null;
  confirmingDelete: ProjectRef | null;
  pendingProjectName: string | null;
  onCreate: (name: string) => void;
  onCancelCreate: () => void;
  onRename: (name: string, projectId: string) => void;
  onCancelRename: () => void;
}

function PendingProjectRow({ name }: { name: string }) {
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return (
    <box
      height={1}
      width={LIST_WIDTH}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      <text fg={THEME_COLORS.textMuted}>
        <span fg={THEME_COLORS.primary}>{SPINNER_FRAMES[spinnerFrame]} </span>
        {truncate(name, MAX_NAME_LENGTH)}
      </text>
      <text fg={THEME_COLORS.textMuted}>(creating...)</text>
    </box>
  );
}

function ProjectRow({ project, isSelected }: { project: Project; isSelected: boolean }) {
  return (
    <box
      height={1}
      width={LIST_WIDTH}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      <text fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
        <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
          {isSelected ? "› " : "  "}
        </span>
        {truncate(project.name, MAX_NAME_LENGTH)}
      </text>
      <text>
        {isSelected && <span fg={THEME_COLORS.textMuted}>[{project.status}] </span>}
        <span fg={STATUS_COLORS[project.status] || THEME_COLORS.text}>
          {STATUS_ICONS[project.status]}
        </span>
      </text>
    </box>
  );
}

export function ProjectList({
  projects,
  isLoading,
  archivedCount,
  pageSize,
  navigation,
  isCreating,
  editingProject,
  confirmingDelete,
  pendingProjectName,
  onCreate,
  onCancelCreate,
  onRename,
  onCancelRename,
}: ProjectListProps) {
  const isEmpty = projects.length === 0 && !isCreating && !pendingProjectName;
  const height =
    isLoading || isEmpty
      ? 1
      : Math.min(projects.length, pageSize) +
        (isCreating ? 1 : 0) +
        (pendingProjectName ? 1 : 0) +
        (confirmingDelete ? 1 : 0) +
        (navigation.hasMore.above ? 1 : 0) +
        (navigation.hasMore.below ? 1 : 0);

  const renderContent = () => {
    if (isLoading) {
      return <text fg={THEME_COLORS.textMuted}>Loading projects...</text>;
    }
    if (isEmpty) {
      return (
        <text fg={THEME_COLORS.textMuted}>
          {archivedCount > 0
            ? "No active projects. Press n to create one."
            : "No projects yet. Press n to create one."}
        </text>
      );
    }
    return (
      <>
        {navigation.hasMore.above && (
          <MoreItems count={navigation.hasMore.aboveCount} position="above" />
        )}
        {navigation.visibleItems.map((project, index) => {
          const isSelected =
            index + navigation.scrollOffset === navigation.selectedIndex &&
            !isCreating &&
            !editingProject;

          return (
            <box key={project.id} flexDirection="column">
              {editingProject?.id === project.id ? (
                <InlineInput
                  active={true}
                  initialValue={project.name}
                  onSubmit={(name) => onRename(name, project.id)}
                  onCancel={onCancelRename}
                  maxWidth={40}
                  maxLength={30}
                  width={LIST_WIDTH}
                  icon="[~]"
                  iconColor={THEME_COLORS.accent}
                />
              ) : (
                <ProjectRow project={project} isSelected={isSelected} />
              )}
              <DeleteConfirmation
                itemType="project"
                itemName={project.name}
                visible={confirmingDelete?.id === project.id}
              />
            </box>
          );
        })}
        {isCreating && (
          <InlineInput
            active={true}
            onSubmit={onCreate}
            onCancel={onCancelCreate}
            maxWidth={28}
            maxLength={30}
            width={LIST_WIDTH}
            placeholder="e.g. my-project"
            icon="[+]"
            iconColor={THEME_COLORS.success}
          />
        )}
        {pendingProjectName && <PendingProjectRow name={pendingProjectName} />}
        {navigation.hasMore.below && (
          <MoreItems count={navigation.hasMore.belowCount} position="below" />
        )}
      </>
    );
  };

  return (
    <box flexDirection="column" width={LIST_WIDTH} height={height}>
      {renderContent()}
    </box>
  );
}

interface ProjectCountProps {
  isLoading: boolean;
  hasError: boolean;
  projectCount: number;
  limits: { usage: number; includedUsage: number } | null;
}

export function ProjectCount({ isLoading, hasError, projectCount, limits }: ProjectCountProps) {
  if (isLoading) {
    return <text fg={THEME_COLORS.textMuted}>...</text>;
  }

  if (hasError) {
    return <text fg={THEME_COLORS.warning}>{projectCount} (limits unavailable)</text>;
  }

  if (!limits) {
    return <text fg={THEME_COLORS.textMuted}>{projectCount}</text>;
  }

  const label = `${limits.usage} project${limits.usage !== 1 ? "s" : ""}`;
  const remainingFree = Math.max(0, limits.includedUsage - limits.usage);

  if (remainingFree === 0) {
    return <text fg={THEME_COLORS.textMuted}>{label}</text>;
  }

  return (
    <text>
      <span fg={THEME_COLORS.textMuted}>{label} </span>
      <span fg={THEME_COLORS.textDim}>(</span>
      <span fg={THEME_COLORS.success}>{remainingFree} free</span>
      <span fg={THEME_COLORS.textDim}>)</span>
    </text>
  );
}
