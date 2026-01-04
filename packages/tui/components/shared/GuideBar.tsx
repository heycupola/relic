import type { Shortcut, ShortcutGroup } from "../../types";
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

/**
 * Ultra-minimal premium GuideBar
 * Shows only essential actions - trusts users to know navigation
 */
export function GuideBar({
  shortcuts,
  groups,
  customWidth,
  minimal = false,
  showHelp = false,
}: GuideBarProps) {
  const boxWidth = customWidth ?? 66;

  // Ultra-minimal premium style
  if (minimal && groups) {
    // Only show first 3 primary actions + help (if enabled)
    const primaryActions = groups.primary.flatMap((g) => g.shortcuts).slice(0, 3);

    return (
      <box width={boxWidth} height={1}>
        <text>
          {primaryActions.map((shortcut, index) => (
            <>
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={shortcut.disabled ? THEME_COLORS.textMuted : THEME_COLORS.primary}>
                {shortcut.key}
              </span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={THEME_COLORS.textMuted}>{shortcut.description}</span>
              {(index < primaryActions.length - 1 || showHelp) && <span> </span>}
            </>
          ))}
          {showHelp && (
            <>
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={THEME_COLORS.accent}>?</span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={THEME_COLORS.textMuted}>help</span>
            </>
          )}
        </text>
      </box>
    );
  }

  // Grouped layout fallback
  if (groups) {
    const allShortcuts = [
      ...groups.primary.flatMap((g) => g.shortcuts),
      ...groups.secondary.flatMap((g) => g.shortcuts),
    ];

    return (
      <box width={boxWidth} height={1}>
        <text>
          {allShortcuts.slice(0, 5).map((shortcut, index) => (
            <>
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={shortcut.disabled ? THEME_COLORS.textMuted : THEME_COLORS.primary}>
                {shortcut.key}
              </span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={THEME_COLORS.textMuted}>{shortcut.description}</span>
              {index < Math.min(allShortcuts.length, 5) - 1 && <span> </span>}
            </>
          ))}
        </text>
      </box>
    );
  }

  // Legacy single shortcuts array
  if (shortcuts) {
    return (
      <box width={boxWidth} height={1}>
        <text>
          {shortcuts.slice(0, 5).map((shortcut, index) => (
            <>
              <span fg={THEME_COLORS.textDim}>[</span>
              <span fg={shortcut.disabled ? THEME_COLORS.textMuted : THEME_COLORS.primary}>
                {shortcut.key}
              </span>
              <span fg={THEME_COLORS.textDim}>] </span>
              <span fg={THEME_COLORS.textMuted}>{shortcut.description}</span>
              {index < Math.min(shortcuts.length, 5) - 1 && <span> </span>}
            </>
          ))}
        </text>
      </box>
    );
  }

  return null;
}
