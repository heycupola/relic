use ratatui::{
    Frame,
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::Paragraph,
};

use crate::tui::state::{BackgroundTask, BackgroundTaskStatus};

pub fn render(frame: &mut Frame, task: &BackgroundTask, area: Rect) {
    let (text, color) = match task.status {
        BackgroundTaskStatus::Running => {
            let spinner = get_spinner_char();
            (format!("{} {} - {}", spinner, task.operation, task.message), Color::Yellow)
        }
        BackgroundTaskStatus::Success => {
            (format!("✓ {} - {}", task.operation, task.message), Color::Green)
        }
        BackgroundTaskStatus::Failed => {
            (format!("✗ {} - {}", task.operation, task.message), Color::Red)
        }
    };

    let status_line = Line::from(vec![
        Span::styled(text, Style::default().fg(color).bg(Color::Black)),
    ]);

    let status_bar = Paragraph::new(status_line)
        .style(Style::default().bg(Color::Black));

    frame.render_widget(status_bar, area);
}

fn get_spinner_char() -> char {
    let frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let index = (now / 100) % frames.len() as u128;
    frames[index as usize]
}
