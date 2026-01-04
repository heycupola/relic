# Relic TUI - Conventions

Consistent keyboard patterns across all TUI screens.

## Navigation Patterns
- **Back**: `Esc` always returns to the previous screen or closes the current modal.
- **Exit/Logout**: `Ctrl+L` for logout, `Ctrl+C` to exit the process.
- **Movement**: `Up/Down` for list navigation, `Tab` to switch focus between inputs.

## Action Patterns
- **New (Create)**: `n`
- **Update (Rename)**: `u`
- **Delete/Remove**: `Backspace` or `d` (requires confirmation).
- **View/Toggle**: `v` (e.g., show/hide secret values).
- **Collaborators**: `c`
- **History/Logs**: `w`

## Developer Rules
- Always display a `GuideBar` component with the current screen's active shortcuts.
- Match existing key patterns for similar actions in new screens.
- Use `useKeyboard` for all global hotkey management.
- Ensure focused inputs have a clear visual indicator (e.g., `>` or color change).
