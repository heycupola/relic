use ratatui::{
    Frame,
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::Paragraph,
};

use super::logo::ELECTRIC_PURPLE;

pub fn render(frame: &mut Frame, area: Rect, help_items: &[(&str, &str)]) {
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
