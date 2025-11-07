mod home;
mod project;
mod types;

pub use types::{OrganizationItem, ProjectListItem, ProjectScreenData, Screen};

use crossterm::event::KeyEvent;
use ratatui::Frame;

use crate::tui::state::AppState;

/// Central screen renderer - delegates to specific screen modules
pub fn render_screen(frame: &mut Frame, state: &AppState) {
    match &state.current_screen {
        Screen::Home => home::render(frame, state),
        Screen::Project(data) => project::render(frame, state, data),
    }
}

/// Central screen key handler - delegates to specific screen modules
/// Returns true if device flow should be started (only from home screen login)
pub fn handle_screen_key_event(state: &mut AppState, key: KeyEvent) -> bool {
    match &state.current_screen {
        Screen::Home => home::handle_key_event(state, key),
        Screen::Project(_) => {
            project::handle_key_event(state, key);
            false
        }
    }
}
