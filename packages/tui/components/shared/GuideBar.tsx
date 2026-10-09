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

function itemWidth(item: GuideItem): number {
  return item.key.length + item.description.length + 3;
}

/** Packs items into rows that fit `width`, keeping primary and secondary items on separate rows. */
function packRows(items: GuideItem[], width: number): GuideItem[][] {
  const rows: GuideItem[][] = [];
  let row: GuideItem[] = [];
  let used = 0;

  for (const item of items) {
    const size = itemWidth(item);
    const gap = row.length > 0 ? 1 : 0;
    const startsSecondary = item.secondary && row.length > 0 && !row[row.length - 1]?.secondary;
    if (row.length > 0 && (startsSecondary || used + gap + size > width)) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += (row.length > 0 ? 1 : 0) + size;
    row.push(item);
  }
  if (row.length > 0) rows.push(row);
  return rows;
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
                ? THEME_COLORS.textMuted
                : THEME_COLORS.primary;
          return (
            <span key={`${item.key}-${index}`}>
              {index > 0 && <span> </span>}
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={keyColor}>{item.key}</span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={item.disabled ? THEME_COLORS.textDim : THEME_COLORS.textMuted}>
                {item.description}
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

  const items: GuideItem[] = groups
    ? [
        ...groups.primary.flatMap((g) => g.shortcuts),
        ...(showHelp ? [HELP_ITEM] : []),
        ...groups.secondary.flatMap((g) => g.shortcuts.map((s) => ({ ...s, secondary: true }))),
      ]
    : [...(shortcuts ?? []), ...(showHelp ? [HELP_ITEM] : [])];

  if (items.length === 0) return null;

  const rows = packRows(items, boxWidth);

  return (
    <box flexDirection="column" width={boxWidth}>
      {rows.map((row, index) => (
        <GuideRow key={`row-${index}`} items={row} width={boxWidth} />
      ))}
    </box>
  );
}
