/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { trackEvent } from "@repo/logger";
import { useEffect, useState } from "react";
import { useSecretHistory } from "../../hooks/useSecretHistory";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { THEME_COLORS } from "../../utils/constants";
import { formatHistoryTime } from "../../utils/history";
import { Modal } from "../shared/Modal";

const MAX_VISIBLE = 8;

interface SecretHistoryModalProps {
  visible: boolean;
  secretId: string | null;
  secretKey: string;
  showValues: boolean;
  isRestricted: boolean;
  onRestored: () => void;
  onClose: () => void;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function SecretHistoryModal({
  visible,
  secretId,
  secretKey,
  showValues,
  isRestricted,
  onRestored,
  onClose,
}: SecretHistoryModalProps) {
  const { isRunning, runTask, showSuccess } = useTaskQueue();
  const { history, items, values, isLoading, error, restore } = useSecretHistory(
    visible ? secretId : null,
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [confirmingVersion, setConfirmingVersion] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setSelectedIndex(0);
      setScrollOffset(0);
      setConfirmingVersion(null);
    }
  }, [visible]);

  const select = (index: number) => {
    setSelectedIndex(index);
    if (index < scrollOffset) setScrollOffset(index);
    else if (index >= scrollOffset + MAX_VISIBLE) setScrollOffset(index - MAX_VISIBLE + 1);
  };

  const handleRestore = async (version: number) => {
    let restored = false;
    await runTask(`Restoring ${secretKey} to v${version}...`, async () => {
      await restore(version);
      restored = true;
    });
    trackEvent("secret_restored", { success: restored });
    if (restored) {
      showSuccess(`${secretKey} restored to v${version}`);
      select(0);
      onRestored();
    }
  };

  useKeyboard((key) => {
    if (!visible || isRunning) return;

    if (confirmingVersion !== null) {
      if (key.name === "y") {
        const version = confirmingVersion;
        setConfirmingVersion(null);
        handleRestore(version);
      } else if (key.name === "n" || key.name === "escape") {
        setConfirmingVersion(null);
      }
      return;
    }

    if (key.name === "escape" || key.name === "h") {
      onClose();
    } else if (key.name === "k" || key.name === "up") {
      if (items.length > 0) select(selectedIndex > 0 ? selectedIndex - 1 : items.length - 1);
    } else if (key.name === "j" || key.name === "down") {
      if (items.length > 0) select(selectedIndex < items.length - 1 ? selectedIndex + 1 : 0);
    } else if ((key.name === "r" || key.name === "return") && !isRestricted) {
      const item = items[selectedIndex];
      if (item && !item.isCurrent) setConfirmingVersion(item.version);
    }
  });

  if (!visible) return null;

  const selected = items[selectedIndex];
  const canRestore = !!selected && !selected.isCurrent && !isRestricted && !isRunning;
  const visibleItems = items.slice(scrollOffset, scrollOffset + MAX_VISIBLE);
  const retentionText = history ? `${history.versions.length}/${history.retentionLimit} kept` : "";

  return (
    <Modal
      visible={true}
      title={`History · ${secretKey}`}
      width={76}
      shortcuts={[
        { key: "r", description: "restore", disabled: !canRestore },
        { key: "esc", description: "close", disabled: isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        <box height={1} flexDirection="row" justifyContent="space-between">
          <text fg={THEME_COLORS.textMuted}>Versions</text>
          <text fg={THEME_COLORS.textDim}>{retentionText}</text>
        </box>

        <box flexDirection="column">
          {isLoading && items.length === 0 ? (
            <text fg={THEME_COLORS.textDim}>Loading history...</text>
          ) : error ? (
            <text fg={THEME_COLORS.error}>{error}</text>
          ) : items.length <= 1 ? (
            <text fg={THEME_COLORS.textDim}>
              No previous versions yet. History starts with the next change.
            </text>
          ) : (
            visibleItems.map((item, offset) => {
              const index = scrollOffset + offset;
              const isSelected = index === selectedIndex;
              const value = showValues
                ? truncate(values.get(item.version) ?? "<unreadable>", 20)
                : "********";

              return (
                <box key={item.version} flexDirection="column">
                  <box height={1}>
                    <text>
                      <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                        {isSelected ? "› " : "  "}
                      </span>
                      <span fg={item.isCurrent ? THEME_COLORS.success : THEME_COLORS.text}>
                        {`v${item.version}`.padEnd(5)}
                      </span>
                      <span fg={THEME_COLORS.textMuted}>{item.label.padEnd(9)}</span>
                      <span fg={THEME_COLORS.textDim}>
                        {formatHistoryTime(item.changedAt).padEnd(11)}
                      </span>
                      <span fg={THEME_COLORS.textDim}>
                        {truncate(item.changedBy, 20).padEnd(21)}
                      </span>
                      <span fg={THEME_COLORS.text}>{value}</span>
                    </text>
                  </box>
                  {confirmingVersion === item.version && (
                    <box height={1} marginLeft={2}>
                      <text>
                        <span fg={THEME_COLORS.textDim}> └─ </span>
                        <span fg={THEME_COLORS.accent}>↺</span>
                        <span fg={THEME_COLORS.text}> Restore v{item.version} as current? </span>
                        <span fg={THEME_COLORS.textDim}>[</span>
                        <span fg={THEME_COLORS.success}>y</span>
                        <span fg={THEME_COLORS.textDim}>] yes [</span>
                        <span fg={THEME_COLORS.error}>n</span>
                        <span fg={THEME_COLORS.textDim}>] no</span>
                      </text>
                    </box>
                  )}
                </box>
              );
            })
          )}
        </box>
      </box>
    </Modal>
  );
}
