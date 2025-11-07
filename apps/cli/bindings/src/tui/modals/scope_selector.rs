use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    Frame,
    layout::Rect,
    style::{Color, Style},
    text::Line,
    widgets::{Block, Borders, Clear, List, ListItem, ListState, Paragraph},
};

use crate::tui::{
    components::{ELECTRIC_PURPLE, centered_rect},
    state::{AppState, Modal},
};

/// Renders the scope selector modal
pub fn render(frame: &mut Frame, state: &AppState, selected_index: usize, area: Rect) {
    let modal_area = centered_rect(50, 40, area);

    frame.render_widget(Clear, modal_area);

    let items: Vec<ListItem> = state
        .available_scopes
        .iter()
        .map(|scope| {
            let line = Line::from(scope.display_name());
            ListItem::new(line)
        })
        .collect();

    let mut list_state = ListState::default();
    list_state.select(Some(selected_index));

    let list = List::new(items)
        .block(
            Block::default()
                .title("Select Scope")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(ELECTRIC_PURPLE)),
        )
        .highlight_style(Style::default().bg(ELECTRIC_PURPLE).fg(Color::White))
        .highlight_symbol("→ ");

    frame.render_stateful_widget(list, modal_area, &mut list_state);

    let help_area = Rect {
        x: modal_area.x + 1,
        y: modal_area.y + modal_area.height - 2,
        width: modal_area.width - 2,
        height: 1,
    };

    let help_text = Paragraph::new("↑/↓ or j/k: navigate | Enter: select | Esc: cancel")
        .style(Style::default().fg(Color::DarkGray));

    frame.render_widget(help_text, help_area);
}

/// Handles key events for the scope selector modal
pub fn handle_key_event(state: &mut AppState, key: KeyEvent) {
    if let Modal::ScopeSelector { selected_index } = &mut state.modal {
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if *selected_index > 0 {
                    *selected_index -= 1;
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if *selected_index < state.available_scopes.len() - 1 {
                    *selected_index += 1;
                }
            }
            KeyCode::Enter => {
                if let Some(scope) = state.available_scopes.get(*selected_index).cloned() {
                    state.current_scope = scope;
                    state.modal = Modal::None;
                    state.selected_project_index = 0;
                }
            }
            KeyCode::Esc => {
                state.modal = Modal::None;
            }
            _ => {}
        }
    }
}
