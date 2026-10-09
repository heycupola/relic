/** @jsxImportSource @opentui/react */
import type { ContainerKind, ItemRef } from "../../hooks/useProjectItemActions";
import type { ViewLevel } from "../../types/models";
import { THEME_COLORS } from "../../utils/constants";
import type { ProjectItem } from "../../utils/projectItems";
import { truncate } from "../../utils/ui";
import { InlineInput } from "../forms/InlineInput";
import { DeleteConfirmation } from "../shared/DeleteConfirmation";
import { MoreItems } from "../shared/MoreItems";

const LIST_WIDTH = 66;
// NOTE: Cursor (2) + type indicator (3) + space (1).
const ROW_PREFIX_WIDTH = 6;
const MAX_SECRET_KEY_LENGTH = 28;
const MASKED_VALUE = "********";

const TYPE_INDICATORS: Record<ProjectItem["type"], { prefix: string; color: string }> = {
  env: { prefix: "[E]", color: THEME_COLORS.secondary },
  folder: { prefix: "[/]", color: THEME_COLORS.accent },
  secret: { prefix: "[*]", color: THEME_COLORS.success },
};

interface ProjectItemListProps {
  items: ProjectItem[];
  viewLevel: ViewLevel;
  selectedIndex: number;
  scrollOffset: number;
  pageSize: number;
  showSecrets: boolean;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage: string;
  creatingItem: ContainerKind | null;
  editingItem: ItemRef<ContainerKind> | null;
  confirmingDelete: ItemRef | null;
  onCreate: (name: string) => void;
  onCancelCreate: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
}

function displayValue(item: Extract<ProjectItem, { type: "secret" }>, showSecrets: boolean) {
  if (!showSecrets) return MASKED_VALUE;
  if (item.value === null) return "…";
  return item.value.replace(/\r?\n/g, "↵");
}

function SecretRow({
  item,
  isSelected,
  showSecrets,
}: {
  item: Extract<ProjectItem, { type: "secret" }>;
  isSelected: boolean;
  showSecrets: boolean;
}) {
  const key = truncate(item.name, MAX_SECRET_KEY_LENGTH);
  const valueRoom = LIST_WIDTH - ROW_PREFIX_WIDTH - key.length - 2 - item.secretType.length - 3;
  const value = truncate(displayValue(item, showSecrets), Math.max(1, valueRoom));

  return (
    <>
      <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}> {key}</span>
      <span fg={THEME_COLORS.textDim}>: </span>
      <span fg={THEME_COLORS.secondary}>{item.secretType}</span>
      <span fg={THEME_COLORS.textDim}> = </span>
      <span fg={THEME_COLORS.accent}>{value}</span>
    </>
  );
}

function ItemRow({
  item,
  isSelected,
  showSecrets,
}: {
  item: ProjectItem;
  isSelected: boolean;
  showSecrets: boolean;
}) {
  const indicator = TYPE_INDICATORS[item.type];
  const canEnter = item.type !== "secret";

  return (
    <box height={1} width={LIST_WIDTH}>
      <text>
        <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
          {isSelected && canEnter ? "› " : "  "}
        </span>
        <span fg={indicator.color}>{indicator.prefix}</span>
        {item.type === "secret" ? (
          <SecretRow item={item} isSelected={isSelected} showSecrets={showSecrets} />
        ) : (
          <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
            {" "}
            {truncate(item.name, LIST_WIDTH - ROW_PREFIX_WIDTH)}
          </span>
        )}
      </text>
    </box>
  );
}

export function ProjectItemList({
  items,
  viewLevel,
  selectedIndex,
  scrollOffset,
  pageSize,
  showSecrets,
  isLoading = false,
  error = null,
  emptyMessage,
  creatingItem,
  editingItem,
  confirmingDelete,
  onCreate,
  onCancelCreate,
  onRename,
  onCancelRename,
}: ProjectItemListProps) {
  const isEmpty = items.length === 0 && !creatingItem;
  const showStatus = isEmpty || (error !== null && items.length === 0);
  const hiddenBelow = items.length - (scrollOffset + pageSize);
  const height = showStatus
    ? 1
    : Math.min(items.length, pageSize) +
      (creatingItem ? 1 : 0) +
      (confirmingDelete ? 1 : 0) +
      (scrollOffset > 0 ? 1 : 0) +
      (hiddenBelow > 0 ? 1 : 0);

  const statusLine = error ? (
    <text fg={THEME_COLORS.error}>{truncate(error, LIST_WIDTH)}</text>
  ) : isLoading ? (
    <text fg={THEME_COLORS.textMuted}>Loading...</text>
  ) : (
    <text fg={THEME_COLORS.textMuted}>{emptyMessage}</text>
  );

  return (
    <box flexDirection="column" width={LIST_WIDTH} height={height}>
      {showStatus ? (
        statusLine
      ) : (
        <>
          {scrollOffset > 0 && <MoreItems count={scrollOffset} position="above" />}
          {items.slice(scrollOffset, scrollOffset + pageSize).map((item, index) => {
            const isSelected =
              index + scrollOffset === selectedIndex && !creatingItem && !editingItem;

            return (
              <box key={item.id} flexDirection="column">
                {editingItem?.id === item.id ? (
                  <InlineInput
                    active={true}
                    initialValue={item.name}
                    onSubmit={onRename}
                    onCancel={onCancelRename}
                    maxWidth={50}
                    maxLength={30}
                    width={LIST_WIDTH}
                    icon="[~]"
                    iconColor={THEME_COLORS.accent}
                  />
                ) : (
                  <ItemRow item={item} isSelected={isSelected} showSecrets={showSecrets} />
                )}
                <DeleteConfirmation
                  itemType={
                    viewLevel === "environments"
                      ? "environment"
                      : item.type === "folder"
                        ? "folder"
                        : "secret"
                  }
                  itemName={item.name}
                  visible={confirmingDelete?.id === item.id}
                />
              </box>
            );
          })}
          {creatingItem && (
            <InlineInput
              active={true}
              onSubmit={onCreate}
              onCancel={onCancelCreate}
              maxWidth={50}
              maxLength={30}
              width={LIST_WIDTH}
              placeholder={
                creatingItem === "env" ? "e.g. production, staging" : "e.g. database, auth"
              }
            />
          )}
          {hiddenBelow > 0 && <MoreItems count={hiddenBelow} position="below" />}
        </>
      )}
    </box>
  );
}
