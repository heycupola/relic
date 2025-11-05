#![allow(dead_code)]

use ratatui::{
    Frame,
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
};
use tui_big_text::{BigText, PixelSize};

pub const ELECTRIC_PURPLE: Color = Color::Rgb(110, 86, 207);

pub fn render_logo(frame: &mut Frame, area: Rect, size: LogoSize) {
    let (pixel_size, text) = match size {
        LogoSize::Large => (PixelSize::Full, "Relic"),
        LogoSize::Small => (PixelSize::HalfHeight, "Relic"),
    };

    let big_text = BigText::builder()
        .pixel_size(pixel_size)
        .style(Style::default().fg(ELECTRIC_PURPLE))
        .lines(vec![text.into()])
        .alignment(Alignment::Center)
        .build();

    frame.render_widget(big_text, area);
}

pub fn render_subtitle(frame: &mut Frame, area: Rect, text: &str) {
    let subtitle = Paragraph::new(text)
        .style(Style::default().fg(Color::Gray))
        .alignment(Alignment::Center);

    frame.render_widget(subtitle, area);
}

pub fn render_help_bar(frame: &mut Frame, area: Rect, help_items: &[(&str, &str)]) {
    let help_text: Vec<Span> = help_items
        .iter()
        .enumerate()
        .flat_map(|(i, (key, desc))| {
            let mut spans = vec![
                Span::styled(*key, Style::default().fg(ELECTRIC_PURPLE)),
                Span::raw(":"),
                Span::raw(*desc),
            ];
            if i < help_items.len() - 1 {
                spans.push(Span::raw(" | "));
            }
            spans
        })
        .collect();

    let paragraph =
        Paragraph::new(Line::from(help_text)).style(Style::default().fg(Color::DarkGray));

    frame.render_widget(paragraph, area);
}

pub fn render_list<'a, I>(
    frame: &mut Frame,
    area: Rect,
    title: &str,
    items: I,
    state: &mut ListState,
) where
    I: IntoIterator<Item = ListItem<'a>>,
{
    let list = List::new(items)
        .block(
            Block::default()
                .title(title)
                .borders(Borders::ALL)
                .border_style(Style::default().fg(ELECTRIC_PURPLE)),
        )
        .highlight_style(Style::default().bg(ELECTRIC_PURPLE).fg(Color::White))
        .highlight_symbol("→ ");

    frame.render_stateful_widget(list, area, state);
}

pub fn centered_rect(percent_x: u16, percent_y: u16, area: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(area);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}

#[derive(Debug, Clone, Copy)]
pub enum LogoSize {
    Large,
    Small,
}
