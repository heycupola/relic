use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::Line,
    widgets::{Block, Borders, List, ListItem, ListState},
};

use crate::tui::{
    components::{
        ELECTRIC_PURPLE, LogoSize, centered_rect, render_help_bar, render_logo, render_subtitle,
    },
    state::{AppState, LoginOption},
};

pub fn render(frame: &mut Frame, state: &AppState) {
    let area = frame.area();

    let container_width = if area.width < 80 {
        90
    } else if area.width < 120 {
        50
    } else {
        35
    };
    let container_height = if area.height < 30 { 95 } else { 70 };
    let main_area = centered_rect(container_width, container_height, area);

    let logo_height = if area.height < 30 { 5 } else { 8 };
    let subtitle_height = if area.height < 30 { 1 } else { 2 };
    let buttons_height = if area.height < 30 { 4 } else { 6 };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(logo_height),
            Constraint::Length(subtitle_height),
            Constraint::Length(buttons_height),
            Constraint::Min(1),
        ])
        .split(main_area);

    let logo_area = centered_rect(70, 100, chunks[0]);
    render_logo(frame, logo_area, LogoSize::Large);

    render_subtitle(frame, chunks[1], "encrypted client-side, zero-knowledge");

    let login_options = AppState::get_login_options();
    let items: Vec<ListItem> = login_options
        .iter()
        .map(|option| {
            let text = match option {
                LoginOption::Google => "Sign in with Google",
                LoginOption::GitHub => "Sign in with GitHub",
            };
            ListItem::new(Line::from(text))
        })
        .collect();

    let mut list_state = ListState::default();
    list_state.select(Some(state.login_selected_index));

    let list = List::new(items)
        .block(Block::default().borders(Borders::NONE))
        .highlight_style(
            Style::default()
                .bg(ELECTRIC_PURPLE)
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("→ ");

    frame.render_stateful_widget(list, chunks[2], &mut list_state);

    let help_items = [
        ("↑/↓", "navigate"),
        ("j/k", "navigate"),
        ("Enter", "select"),
        ("q", "quit"),
    ];
    render_help_bar(frame, chunks[3], &help_items);
}

pub fn handle_key_event(state: &mut AppState, key: KeyEvent) -> bool {
    match key.code {
        KeyCode::Up | KeyCode::Char('k') => {
            if state.login_selected_index > 0 {
                state.login_selected_index -= 1;
            }
        }
        KeyCode::Down | KeyCode::Char('j') => {
            let options = AppState::get_login_options();
            if state.login_selected_index < options.len() - 1 {
                state.login_selected_index += 1;
            }
        }
        KeyCode::Enter => {
            return true; // Signal to start device flow
        }
        _ => {}
    }
    false
}
