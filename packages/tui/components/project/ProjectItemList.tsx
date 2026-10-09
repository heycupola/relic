/** @jsxImportSource @opentui/react */
import type { ContainerKind, ItemRef } from "../../hooks/useProjectItemActions";
import type { ViewLevel } from "../../types/models";
import { THEME_COLORS } from "../../utils/constants";
import type { ProjectItem } from "../../utils/projectItems";
import { InlineInput } from "../forms/InlineInput";
import { DeleteConfirmation } from "../shared/DeleteConfirmation";
import { MoreItems } from "../shared/MoreItems";

const LIST_WIDTH = 66;

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
  creatingItem: ContainerKind | null;
  editingItem: ItemRef<ContainerKind> | null;
  confirmingDelete: ItemRef | null;
  onCreate: (name: string) => void;
  onCancelCreate: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
}

function SecretValue({
  item,
  showSecrets,
}: {
  item: Extract<ProjectItem, { type: "secret" }>;
  showSecrets: boolean;
}) {
  const value = showSecrets ? item.value : "********";
  const maxLen = LIST_WIDTH - 6 - item.name.length - 2 - item.secretType.length - 3;
  const display = value.length > maxLen ? `${value.slice(0, maxLen - 3)}...` : value;

  return (
    <>
      <span fg={THEME_COLORS.textDim}>: </span>
      <span fg={THEME_COLORS.secondary}>{item.secretType}</span>
      <span fg={THEME_COLORS.textDim}> = </span>
      <span fg={THEME_COLORS.accent}>{display}</span>
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
        <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}> {item.name}</span>
        {item.type === "secret" && <SecretValue item={item} showSecrets={showSecrets} />}
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
  creatingItem,
  editingItem,
  confirmingDelete,
  onCreate,
  onCancelCreate,
  onRename,
  onCancelRename,
}: ProjectItemListProps) {
  const isEmpty = items.length === 0 && !creatingItem;
  const hiddenBelow = items.length - (scrollOffset + pageSize);
  const height = isEmpty
    ? 1
    : Math.min(
        items.length + (creatingItem ? 1 : 0) + (confirmingDelete ? 1 : 0),
        pageSize + (confirmingDelete ? 1 : 0),
      ) +
      (scrollOffset > 0 ? 1 : 0) +
      (hiddenBelow > 0 ? 1 : 0);

  return (
    <box flexDirection="column" width={LIST_WIDTH} height={height}>
      {isEmpty ? (
        <text fg={THEME_COLORS.textDim}>Empty. Use shortcuts below to create items.</text>
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
