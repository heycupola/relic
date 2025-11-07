use ratatui::{
    Frame,
    layout::Rect,
    style::{Color, Style},
    widgets::{Block, Borders, List, ListItem, ListState},
};

use super::logo::ELECTRIC_PURPLE;

pub fn render<'a, I>(frame: &mut Frame, area: Rect, title: &str, items: I, state: &mut ListState)
where
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
