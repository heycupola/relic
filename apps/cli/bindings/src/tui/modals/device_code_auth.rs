use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
};

use crate::tui::{
    components::{centered_rect, ELECTRIC_PURPLE},
    state::{AppState, Modal},
};

/// Renders the device code authorization modal
pub fn render(frame: &mut Frame, user_code: &str, redirect_url: &str, area: Rect) {
    let background = Block::default().style(Style::default().bg(Color::Black).fg(Color::DarkGray));
    frame.render_widget(background, area);

    let modal_area = centered_rect(60, 30, area);

    frame.render_widget(Clear, modal_area);

    let block = Block::default()
        .title("Device Authorization")
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
            Constraint::Length(3),
            Constraint::Length(1),
            Constraint::Min(1),
        ])
        .split(inner_area);

    let instruction = Paragraph::new("Verify this code matches in your browser:")
        .style(Style::default().fg(Color::Gray))
        .alignment(ratatui::layout::Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(instruction, chunks[0]);

    let code_display = Paragraph::new(user_code)
        .style(
            Style::default()
                .fg(ELECTRIC_PURPLE)
                .add_modifier(Modifier::BOLD),
        )
        .alignment(ratatui::layout::Alignment::Center);

    frame.render_widget(code_display, chunks[1]);

    let url_display = Paragraph::new(redirect_url)
        .style(Style::default().fg(Color::DarkGray))
        .alignment(ratatui::layout::Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(url_display, chunks[2]);

    let waiting_text = Paragraph::new("⏳ waiting...")
        .style(Style::default().fg(Color::DarkGray))
        .alignment(ratatui::layout::Alignment::Center);

    frame.render_widget(waiting_text, chunks[3]);
}

/// Handles key events for the device code authorization modal
pub fn handle_key_event(state: &mut AppState, key: KeyEvent) {
    match key.code {
        KeyCode::Esc => {
            state.modal = Modal::None;
            state.last_device_poll = None;
        }
        _ => {}
    }
}
