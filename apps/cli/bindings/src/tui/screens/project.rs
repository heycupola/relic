use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
};

use super::types::{ProjectScreenData, Screen};
use crate::tui::{
    components::{ELECTRIC_PURPLE, render_help_bar},
    state::AppState,
};

pub fn render(frame: &mut Frame, _state: &AppState, project: &ProjectScreenData) {
    let area = frame.area();

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(10), Constraint::Length(2)])
        .split(area);

    let content_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Length(5),
            Constraint::Min(5),
        ])
        .split(chunks[0]);

    let title_text = vec![Line::from(vec![
        Span::styled("Project: ", Style::default().fg(Color::Gray)),
        Span::styled(
            &project.project_name,
            Style::default()
                .fg(ELECTRIC_PURPLE)
                .add_modifier(Modifier::BOLD),
        ),
    ])];

    let title = Paragraph::new(title_text).block(
        Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(ELECTRIC_PURPLE)),
    );

    frame.render_widget(title, content_chunks[0]);

    let created_at = format_timestamp(project.created_at);
    let updated_at = format_timestamp(project.updated_at);

    let metadata_lines = vec![
        Line::from(vec![
            Span::styled("Slug: ", Style::default().fg(Color::Gray)),
            Span::raw(&project.project_slug),
        ]),
        Line::from(vec![
            Span::styled("Owner Type: ", Style::default().fg(Color::Gray)),
            Span::raw(&project.owner_type),
        ]),
        Line::from(vec![
            Span::styled("Created: ", Style::default().fg(Color::Gray)),
            Span::raw(created_at),
        ]),
        Line::from(vec![
            Span::styled("Updated: ", Style::default().fg(Color::Gray)),
            Span::raw(updated_at),
        ]),
    ];

    let metadata = Paragraph::new(metadata_lines).block(
        Block::default()
            .title("Details")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    );

    frame.render_widget(metadata, content_chunks[1]);

    let description = if let Some(desc) = &project.project_description {
        desc.clone()
    } else {
        String::from("No description provided.")
    };

    let description_para = Paragraph::new(description)
        .block(
            Block::default()
                .title("Description")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray)),
        )
        .wrap(Wrap { trim: false })
        .style(Style::default().fg(Color::White));

    frame.render_widget(description_para, content_chunks[2]);

    let help_items = [("Esc/b", "back to home"), ("q", "quit")];
    render_help_bar(frame, chunks[1], &help_items);
}

pub fn handle_key_event(state: &mut AppState, key: KeyEvent) -> bool {
    match key.code {
        KeyCode::Esc | KeyCode::Char('b') => {
            state.current_screen = Screen::Home;
        }
        _ => {}
    }

    false
}

// NOTE: helper functions
fn format_timestamp(timestamp: i64) -> String {
    use std::time::{Duration, UNIX_EPOCH};

    let duration = Duration::from_millis(timestamp as u64);
    let datetime = UNIX_EPOCH + duration;

    match datetime.elapsed() {
        Ok(elapsed) => {
            let secs = elapsed.as_secs();
            if secs < 60 {
                format!("{} seconds ago", secs)
            } else if secs < 3600 {
                format!("{} minutes ago", secs / 60)
            } else if secs < 86400 {
                format!("{} hours ago", secs / 3600)
            } else {
                format!("{} days ago", secs / 86400)
            }
        }
        Err(_) => String::from("in the future"),
    }
}
