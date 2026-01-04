/**
 * Unified keyboard event interface.
 * Used across all input hooks for consistent key handling.
 */
export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option: boolean;
  sequence: string;
}

/**
 * Cursor position for multiline inputs.
 */
export interface CursorPosition {
  line: number;
  column: number;
}

/**
 * Shortcut display configuration.
 */
export interface Shortcut {
  key: string;
  description: string;
  disabled?: boolean;
}

/**
 * Shortcut group for GuideBar.
 */
export interface ShortcutGroup {
  shortcuts: Shortcut[];
}
