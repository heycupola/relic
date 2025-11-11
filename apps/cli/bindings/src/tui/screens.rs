mod home;
mod login;
mod project;
mod types;

pub use types::{OrganizationItem, ProjectListItem, Screen};

use crossterm::event::KeyEvent;
use ratatui::Frame;

use crate::tui::state::AppState;

pub fn render_screen(frame: &mut Frame, state: &mut AppState) {
    if !state.is_logged_in() {
        if !matches!(state.current_screen, Screen::Login) {
            state.current_screen = Screen::Login;
            state.modal = crate::tui::state::Modal::None;
        }
        render_public_screens(frame, state);
    } else {
        if matches!(state.current_screen, Screen::Login) {
            state.current_screen = Screen::Home;
        }
        render_protected_screens(frame, state);
    }
}

pub fn render_public_screens(frame: &mut Frame, state: &AppState) {
    match &state.current_screen {
        Screen::Login => login::render(frame, state),
        _ => {}
    }
}

pub fn render_protected_screens(frame: &mut Frame, state: &AppState) {
    match &state.current_screen {
        Screen::Home => home::render(frame, state),
        Screen::Project(data) => project::render(frame, state, data),
        _ => {}
    }
}

pub fn handle_screen_key_event(state: &mut AppState, key: KeyEvent) -> bool {
    match &state.current_screen {
        Screen::Login => login::handle_key_event(state, key),
        Screen::Home => home::handle_key_event(state, key),
        Screen::Project(_) => project::handle_key_event(state, key),
    }
}
