use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    Frame,
    layout::{Alignment, Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
};

use super::types::{ProjectScreenData, Screen};
use crate::tui::{
    components::{ELECTRIC_PURPLE, LogoSize, centered_rect, render_help_bar, render_logo},
    state::{AppState, Modal},
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
}

/// NOTE: returns false as device flow is only triggered from login screen
pub fn handle_key_event(state: &mut AppState, key: KeyEvent) -> bool {
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
            if !state.projects.is_empty() && state.selected_project_index < state.projects.len() - 1
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

    false
}
