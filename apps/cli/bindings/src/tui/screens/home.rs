use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    Frame,
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
};

use super::types::{ProjectScreenData, Screen};
use crate::tui::{
    components::{
        ELECTRIC_PURPLE, LogoSize, centered_rect, render_help_bar, render_logo, render_subtitle,
    },
    state::{AppState, LoginOption, MessageType, Modal},
};

/// Renders the home screen
pub fn render(frame: &mut Frame, state: &AppState) {
    let area = frame.area();

    if !state.is_logged_in() {
        render_login_view(frame, state, area);
    } else {
        render_projects_view(frame, state, area);
    }
}

/// Handles key events for the home screen
/// Returns true if Enter was pressed on login (signals device flow should start)
pub fn handle_key_event(state: &mut AppState, key: KeyEvent) -> bool {
    if !state.is_logged_in() {
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
    } else {
        match key.code {
            KeyCode::Char('s') => {
                state.modal = Modal::ScopeSelector { selected_index: 0 };
            }
            KeyCode::Char('n') => {
                state.modal = Modal::CreateProject {
                    name: String::new(),
                    slug: String::new(),
                    description: String::new(),
                    selected_scope: state.current_scope.clone(),
                    focused_field: 0,
                    selecting_scope: false,
                    scope_selector_index: 0,
                };
            }
            KeyCode::Char('o') => {
                state.modal = Modal::CreateOrganization {
                    organization_name: String::new(),
                    focused_field: 0,
                };
            }
            KeyCode::Up | KeyCode::Char('k') => {
                if !state.projects.is_empty() && state.selected_project_index > 0 {
                    state.selected_project_index -= 1;
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if !state.projects.is_empty()
                    && state.selected_project_index < state.projects.len() - 1
                {
                    state.selected_project_index += 1;
                }
            }
            KeyCode::Enter => {
                if let Some(project) = state.projects.get(state.selected_project_index) {
                    state.current_screen = Screen::Project(ProjectScreenData {
                        project_id: project.id.clone(),
                        project_name: project.name.clone(),
                        project_slug: project.slug.clone(),
                        project_description: project.description.clone(),
                        owner_type: "personal".to_string(),
                        owner_id: "".to_string(),
                        created_at: project.created_at,
                        updated_at: project.updated_at,
                    });
                }
            }
            _ => {}
        }
    }
    false
}

// Private rendering helper functions

fn render_login_view(frame: &mut Frame, state: &AppState, area: Rect) {
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

fn render_projects_view(frame: &mut Frame, state: &AppState, area: Rect) {
    let container_width = if area.width < 80 {
        90
    } else if area.width < 120 {
        50
    } else {
        35
    };
    let container_height = if area.height < 30 { 98 } else { 85 };
    let main_area = centered_rect(container_width, container_height, area);

    let logo_height = if area.height < 30 { 3 } else { 5 };
    let scope_height = if area.height < 30 { 1 } else { 2 };
    let min_projects_height = if area.height < 30 { 5 } else { 8 };
    let help_height = if area.height < 30 { 1 } else { 2 };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(logo_height),
            Constraint::Length(scope_height),
            Constraint::Min(min_projects_height),
            Constraint::Length(help_height),
        ])
        .split(main_area);

    let logo_area = centered_rect(70, 100, chunks[0]);
    render_logo(frame, logo_area, LogoSize::Small);

    let scope_text = format!("Scope: {}", state.current_scope.display_name());
    let scope_para = Paragraph::new(scope_text)
        .style(Style::default().fg(ELECTRIC_PURPLE))
        .alignment(Alignment::Center);
    frame.render_widget(scope_para, chunks[1]);

    if state.projects.is_empty() {
        let empty_message = Paragraph::new("No projects found. Press 'n' to create one.")
            .style(Style::default().fg(Color::DarkGray))
            .alignment(Alignment::Center)
            .block(
                Block::default()
                    .title("Projects")
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(ELECTRIC_PURPLE)),
            );
        frame.render_widget(empty_message, chunks[2]);
    } else {
        let items: Vec<ListItem> = state
            .projects
            .iter()
            .map(|project| {
                let mut spans = vec![Span::raw(&project.name)];

                if project.is_restricted {
                    spans.push(Span::raw(" "));
                    spans.push(Span::styled(
                        "[RESTRICTED]",
                        Style::default().fg(Color::Red),
                    ));
                }

                if let Some(desc) = &project.description {
                    if !desc.is_empty() {
                        let desc_text = format!(" - {}", desc);
                        spans.push(Span::styled(desc_text, Style::default().fg(Color::Gray)));
                    }
                }

                ListItem::new(Line::from(spans))
            })
            .collect();

        let mut list_state = ListState::default();
        list_state.select(Some(state.selected_project_index));

        let list = List::new(items)
            .block(
                Block::default()
                    .title("Projects")
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(ELECTRIC_PURPLE)),
            )
            .highlight_style(
                Style::default()
                    .bg(ELECTRIC_PURPLE)
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
            )
            .highlight_symbol("→ ");

        frame.render_stateful_widget(list, chunks[2], &mut list_state);
    }

    let help_items = [
        ("s", "scope"),
        ("n", "new project"),
        ("o", "new org"),
        ("↑/↓,j/k", "navigate"),
        ("Enter", "open"),
        ("q", "quit"),
    ];
    render_help_bar(frame, chunks[3], &help_items);

    if let Some((message_text, message_type)) = &state.message {
        let message_area = centered_rect(60, 20, area);

        let (title, color) = match message_type {
            MessageType::Success => ("Success", Color::Green),
            MessageType::Error => ("Error", Color::Red),
            MessageType::Info => ("Info", Color::Cyan),
        };

        let message_block = Block::default()
            .title(title)
            .borders(Borders::ALL)
            .border_style(Style::default().fg(color));

        let message_para = Paragraph::new(message_text.as_str())
            .block(message_block)
            .style(Style::default().fg(color))
            .alignment(Alignment::Center)
            .wrap(ratatui::widgets::Wrap { trim: true });

        frame.render_widget(message_para, message_area);
    }
}
