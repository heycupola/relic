import { trackEvent } from "@repo/logger";
import { useState } from "react";
import { useTaskQueue } from "./useTaskQueue";

export type ContainerKind = "env" | "folder";
export type ItemKind = ContainerKind | "secret";

export interface ItemRef<T extends ItemKind = ItemKind> {
  type: T;
  id: string;
  name: string;
}

const LABELS: Record<ItemKind, string> = {
  env: "environment",
  folder: "folder",
  secret: "secret",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface UseProjectItemActionsOptions {
  selectedEnvId: string | null;
  createEnvironment: (name: string) => Promise<unknown>;
  createFolder: (environmentId: string, name: string) => Promise<unknown>;
  updateEnvironment: (id: string, name: string) => Promise<unknown>;
  updateFolder: (id: string, name: string) => Promise<unknown>;
  deleteEnvironment: (id: string) => Promise<unknown>;
  deleteFolder: (id: string) => Promise<unknown>;
  deleteSecret: (id: string) => Promise<unknown>;
  onDeleted: (item: ItemRef) => void;
}

export function useProjectItemActions({
  selectedEnvId,
  createEnvironment,
  createFolder,
  updateEnvironment,
  updateFolder,
  deleteEnvironment,
  deleteFolder,
  deleteSecret,
  onDeleted,
}: UseProjectItemActionsOptions) {
  const { attemptTask, showSuccess } = useTaskQueue();
  const [creatingItem, setCreatingItem] = useState<ContainerKind | null>(null);
  const [editingItem, setEditingItem] = useState<ItemRef<ContainerKind> | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<ItemRef | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const runBusy = async (fn: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await fn();
    } finally {
      setIsBusy(false);
    }
  };

  const createItem = async (name: string) => {
    if (isBusy || !creatingItem) return;
    const label = LABELS[creatingItem];
    const environmentId = selectedEnvId;
    const create =
      creatingItem === "env"
        ? () => createEnvironment(name)
        : environmentId
          ? () => createFolder(environmentId, name)
          : null;

    if (create) {
      await runBusy(async () => {
        const created = await attemptTask(`Creating ${label} "${name}"...`, create);
        trackEvent(`${label}_created`, { success: created });
        if (created) showSuccess(`${capitalize(label)} "${name}" created`);
      });
    }
    setCreatingItem(null);
  };

  const renameItem = async (name: string) => {
    if (isBusy) return;
    if (!editingItem || name === editingItem.name) {
      setEditingItem(null);
      return;
    }
    const { type, id } = editingItem;
    const label = LABELS[type];
    await runBusy(async () => {
      const renamed = await attemptTask(`Renaming ${label} to "${name}"...`, () =>
        type === "env" ? updateEnvironment(id, name) : updateFolder(id, name),
      );
      trackEvent(`${label}_renamed`, { success: renamed });
      if (renamed) showSuccess(`${capitalize(label)} renamed to "${name}"`);
    });
    setEditingItem(null);
  };

  const deleteItem = async () => {
    if (isBusy || !confirmingDelete) return;
    const item = confirmingDelete;
    const label = LABELS[item.type];
    const remove = { env: deleteEnvironment, folder: deleteFolder, secret: deleteSecret }[
      item.type
    ];
    await runBusy(async () => {
      const deleted = await attemptTask(`Deleting ${label} "${item.name}"...`, () =>
        remove(item.id),
      );
      trackEvent(`${label}_deleted`, { success: deleted });
      if (!deleted) return;
      showSuccess(`${capitalize(label)} "${item.name}" deleted`);
      onDeleted(item);
    });
    setConfirmingDelete(null);
  };

  return {
    creatingItem,
    setCreatingItem,
    editingItem,
    setEditingItem,
    confirmingDelete,
    setConfirmingDelete,
    isBusy,
    createItem,
    renameItem,
    deleteItem,
  };
}
