use ratatui::{
    Frame,
    layout::{Alignment, Rect},
    style::{Color, Style},
};
use tui_big_text::{BigText, PixelSize};

pub const ELECTRIC_PURPLE: Color = Color::Rgb(110, 86, 207);

#[derive(Debug, Clone, Copy)]
pub enum LogoSize {
    Large,
    Small,
}

pub fn render(frame: &mut Frame, area: Rect, size: LogoSize) {
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
