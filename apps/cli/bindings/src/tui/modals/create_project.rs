use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::Line,
    widgets::{Block, Borders, Clear, List, ListItem, ListState, Paragraph, Wrap},
};

use crate::tui::{
    components::{centered_rect, ELECTRIC_PURPLE},
    state::{AppState, MessageType, Modal, Scope},
};

/// Renders the create project modal
pub fn render(
    frame: &mut Frame,
    state: &AppState,
    name: &str,
    slug: &str,
    description: &str,
    selected_scope: &Scope,
    focused_field: usize,
    selecting_scope: bool,
    scope_selector_index: usize,
    area: Rect,
) {
    let modal_area = centered_rect(60, 60, area);

    frame.render_widget(Clear, modal_area);

    let block = Block::default()
        .title("Create Project")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ELECTRIC_PURPLE));

    frame.render_widget(block, modal_area);

    let inner_area = Rect {
        x: modal_area.x + 2,
        y: modal_area.y + 2,
        width: modal_area.width - 4,
        height: modal_area.height - 4,
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(5),
            Constraint::Length(3),
            Constraint::Min(1),
            Constraint::Length(2),
        ])
        .split(inner_area);

    render_input_field(
        frame,
        chunks[0],
        "Name (required)",
        name,
        focused_field == 0,
    );
    render_input_field(
        frame,
        chunks[1],
        "Slug (required)",
        slug,
        focused_field == 1,
    );
    render_text_area_field(
        frame,
        chunks[2],
        "Description (optional)",
        description,
        focused_field == 2,
    );
    render_input_field(
        frame,
        chunks[3],
        "Scope",
        selected_scope.display_name(),
        focused_field == 3,
    );

    let help_text =
        Paragraph::new("Tab: next | Enter on Scope: select | Ctrl+S: create | Esc: cancel")
            .style(Style::default().fg(Color::DarkGray))
            .wrap(Wrap { trim: true });

    frame.render_widget(help_text, chunks[5]);

    // Render nested scope selector overlay when selecting_scope is true
    if selecting_scope {
        render_nested_scope_selector(frame, state, scope_selector_index, modal_area);
    }
}

/// Handles key events for the create project modal
pub fn handle_key_event(state: &mut AppState, key: KeyEvent) {
    if let Modal::CreateProject {
        name,
        slug,
        description,
        selected_scope,
        focused_field,
        selecting_scope,
        scope_selector_index,
    } = &mut state.modal
    {
        if *selecting_scope {
            match key.code {
                KeyCode::Up | KeyCode::Char('k') => {
                    if *scope_selector_index > 0 {
                        *scope_selector_index -= 1;
                    }
                }
                KeyCode::Down | KeyCode::Char('j') => {
                    if *scope_selector_index < state.available_scopes.len() - 1 {
                        *scope_selector_index += 1;
                    }
                }
                KeyCode::Enter => {
                    if let Some(scope) = state.available_scopes.get(*scope_selector_index).cloned()
                    {
                        *selected_scope = scope;
                        *selecting_scope = false;
                    }
                }
                KeyCode::Esc => {
                    *selecting_scope = false;
                }
                _ => {}
            }
            return;
        }

        match key.modifiers {
            KeyModifiers::SHIFT => {
                if *focused_field > 0 {
                    *focused_field -= 1;
                }
            }
            _ => {}
        }

        match key.code {
            KeyCode::Esc => {
                state.modal = Modal::None;
            }
            KeyCode::Tab => {
                if *focused_field < 3 {
                    *focused_field += 1;
                }
            }
            KeyCode::Enter if *focused_field == 3 => {
                *selecting_scope = true;
                *scope_selector_index = state
                    .available_scopes
                    .iter()
                    .position(|s| s == selected_scope)
                    .unwrap_or(0);
            }
            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                state.message = Some((
                    "Project creation not yet implemented (backend integration needed)".to_string(),
                    MessageType::Info,
                ));
                state.modal = Modal::None;
            }
            KeyCode::Char(c) => {
                let target = match *focused_field {
                    0 => name,
                    1 => slug,
                    2 => description,
                    _ => return,
                };
                target.push(c);
            }
            KeyCode::Backspace => {
                let target = match *focused_field {
                    0 => name,
                    1 => slug,
                    2 => description,
                    _ => return,
                };
                target.pop();
            }
            _ => {}
        }
    }
}

// Helper functions

fn render_input_field(frame: &mut Frame, area: Rect, label: &str, value: &str, is_focused: bool) {
    let style = if is_focused {
        Style::default()
            .fg(ELECTRIC_PURPLE)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::Gray)
    };

    let border_style = if is_focused {
        Style::default().fg(ELECTRIC_PURPLE)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let input_text = if is_focused {
        format!("{}_", value)
    } else {
        value.to_string()
    };

    let input = Paragraph::new(input_text)
        .block(
            Block::default()
                .title(label)
                .borders(Borders::ALL)
                .border_style(border_style),
        )
        .style(style);

    frame.render_widget(input, area);
}

fn render_text_area_field(
    frame: &mut Frame,
    area: Rect,
    label: &str,
    value: &str,
    is_focused: bool,
) {
    let border_style = if is_focused {
        Style::default().fg(ELECTRIC_PURPLE)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let style = if is_focused {
        Style::default().fg(ELECTRIC_PURPLE)
    } else {
        Style::default().fg(Color::Gray)
    };

    let input_text = if is_focused {
        format!("{}_", value)
    } else {
        value.to_string()
    };

    let textarea = Paragraph::new(input_text)
        .block(
            Block::default()
                .title(label)
                .borders(Borders::ALL)
                .border_style(border_style),
        )
        .style(style)
        .wrap(Wrap { trim: false });

    frame.render_widget(textarea, area);
}

fn render_nested_scope_selector(
    frame: &mut Frame,
    state: &AppState,
    selected_index: usize,
    parent_area: Rect,
) {
    let selector_area = centered_rect(40, 30, parent_area);

    frame.render_widget(Clear, selector_area);

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

    frame.render_stateful_widget(list, selector_area, &mut list_state);

    let help_area = Rect {
        x: selector_area.x + 1,
        y: selector_area.y + selector_area.height - 2,
        width: selector_area.width - 2,
        height: 1,
    };

    let help_text = Paragraph::new("↑/↓ or j/k: navigate | Enter: select | Esc: cancel")
        .style(Style::default().fg(Color::DarkGray));

    frame.render_widget(help_text, help_area);
}
