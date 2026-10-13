/** @jsxImportSource @opentui/react */
import type { Shortcut, ShortcutGroup } from "../../types/keyboard";
import { THEME_COLORS } from "../../utils/constants";

interface GuideBarProps {
  shortcuts?: Shortcut[];
  groups?: {
    primary: ShortcutGroup[];
    secondary: ShortcutGroup[];
  };
  inline?: boolean;
  customWidth?: number;
  minimal?: boolean;
  showHelp?: boolean;
}

interface GuideItem extends Shortcut {
  secondary?: boolean;
  isHelp?: boolean;
}

const HELP_ITEM: GuideItem = { key: "?", description: "help", isHelp: true };
const ITEM_GAP = 2;

function itemWidth(item: GuideItem): number {
  return item.key.length + 1 + item.description.length;
}

function rowWidth(row: GuideItem[]): number {
  return row.reduce((sum, item) => sum + itemWidth(item), 0) + ITEM_GAP * (row.length - 1);
}

/** Splits a section into the fewest evenly sized rows that fit `width`. */
function layoutSection(items: GuideItem[], width: number): GuideItem[][] {
  for (let rowCount = 1; rowCount <= items.length; rowCount++) {
    const size = Math.ceil(items.length / rowCount);
    const rows: GuideItem[][] = [];
    for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
    if (rows.every((row) => rowWidth(row) <= width)) return rows;
  }
  return items.map((item) => [item]);
}

function GuideRow({ items, width }: { items: GuideItem[]; width: number }) {
  return (
    <box width={width} height={1}>
      <text>
        {items.map((item, index) => {
          const keyColor = item.disabled
            ? THEME_COLORS.textDim
            : item.isHelp
              ? THEME_COLORS.accent
              : item.secondary
                ? THEME_COLORS.text
                : THEME_COLORS.primary;
          return (
            <span key={`${item.key}-${index}`}>
              {index > 0 && <span>{" ".repeat(ITEM_GAP)}</span>}
              <span fg={keyColor}>{item.key}</span>
              <span fg={item.disabled ? THEME_COLORS.textDim : THEME_COLORS.textMuted}>
                {` ${item.description}`}
              </span>
            </span>
          );
        })}
      </text>
    </box>
  );
}

export function GuideBar({ shortcuts, groups, customWidth, showHelp = false }: GuideBarProps) {
  const boxWidth = customWidth ?? 66;

  const primary: GuideItem[] = groups
    ? groups.primary.flatMap((g) => g.shortcuts)
    : [...(shortcuts ?? [])];
  const secondary: GuideItem[] = groups
    ? groups.secondary.flatMap((g) => g.shortcuts.map((s) => ({ ...s, secondary: true })))
    : [];
  if (showHelp) (secondary.length > 0 ? secondary : primary).push(HELP_ITEM);

  const rows = [primary, secondary]
    .filter((section) => section.length > 0)
    .flatMap((section) => layoutSection(section, boxWidth));
  if (rows.length === 0) return null;

  return (
    <box flexDirection="column" width={boxWidth}>
      {rows.map((row, index) => (
        <GuideRow key={`row-${index}`} items={row} width={boxWidth} />
      ))}
    </box>
  );
}
