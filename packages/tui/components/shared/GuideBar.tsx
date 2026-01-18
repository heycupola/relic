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

export function GuideBar({
  shortcuts,
  groups,
  customWidth,
  minimal = false,
  showHelp = false,
}: GuideBarProps) {
  const boxWidth = customWidth ?? 66;

  if (minimal && groups) {
    const primaryActions = groups.primary.flatMap((g) => g.shortcuts).slice(0, 3);

    return (
      <box width={boxWidth} height={1}>
        <text>
          {primaryActions.map((shortcut, index) => (
            <span key={`${shortcut.key}-${index}`}>
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={shortcut.disabled ? THEME_COLORS.textMuted : THEME_COLORS.primary}>
                {shortcut.key}
              </span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={THEME_COLORS.textMuted}>{shortcut.description}</span>
              {(index < primaryActions.length - 1 || showHelp) && <span> </span>}
            </span>
          ))}
          {showHelp && (
            <span key="help">
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={THEME_COLORS.accent}>?</span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={THEME_COLORS.textMuted}>help</span>
            </span>
          )}
        </text>
      </box>
    );
  }

  if (groups) {
    const allShortcuts = [
      ...groups.primary.flatMap((g) => g.shortcuts),
      ...groups.secondary.flatMap((g) => g.shortcuts),
    ];

    return (
      <box width={boxWidth} height={1}>
        <text>
          {allShortcuts.slice(0, 5).map((shortcut, index) => (
            <span key={`${shortcut.key}-${index}`}>
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={shortcut.disabled ? THEME_COLORS.textMuted : THEME_COLORS.primary}>
                {shortcut.key}
              </span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={THEME_COLORS.textMuted}>{shortcut.description}</span>
              {index < Math.min(allShortcuts.length, 5) - 1 && <span> </span>}
            </span>
          ))}
        </text>
      </box>
    );
  }

  if (shortcuts) {
    return (
      <box width={boxWidth} height={1}>
        <text>
          {shortcuts.slice(0, 5).map((shortcut, index) => (
            <span key={`${shortcut.key}-${index}`}>
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={shortcut.disabled ? THEME_COLORS.textMuted : THEME_COLORS.primary}>
                {shortcut.key}
              </span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={THEME_COLORS.textMuted}>{shortcut.description}</span>
              {index < Math.min(shortcuts.length, 5) - 1 && <span> </span>}
            </span>
          ))}
        </text>
      </box>
    );
  }

  return null;
}
