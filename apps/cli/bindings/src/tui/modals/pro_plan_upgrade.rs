use std::sync::Arc;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
};

use crate::{
    helper::scope_guard::ScopeGuard,
    service::user::get_pro_plan,
    tui::{
        components::{ELECTRIC_PURPLE, centered_rect},
        state::{AppState, BackgroundTask, MessageType, Modal},
    },
};

pub fn render(frame: &mut Frame, area: Rect) {
    // Render dark background overlay
    let background = Block::default().style(Style::default().bg(Color::Black).fg(Color::DarkGray));
    frame.render_widget(background, area);

    // Smaller, more compact modal size
    let modal_area = centered_rect(50, 30, area);

    frame.render_widget(Clear, modal_area);

    let block = Block::default()
        .title("⭐ Pro Plan Required")
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
            Constraint::Length(1), // Spacer
            Constraint::Length(3), // Title
            Constraint::Length(1), // Spacer
            Constraint::Length(4), // Message
            Constraint::Length(1), // Spacer
            Constraint::Length(2), // Help text
        ])
        .split(inner_area);

    // Title
    let title_text = Paragraph::new(vec![Line::from(Span::styled(
        "Upgrade to Pro",
        Style::default()
            .fg(ELECTRIC_PURPLE)
            .add_modifier(Modifier::BOLD),
    ))])
    .alignment(ratatui::layout::Alignment::Center)
    .wrap(Wrap { trim: true });

    frame.render_widget(title_text, chunks[1]);

    // Message
    let message_text = Paragraph::new(vec![
        Line::from(Span::styled(
            "In order to perform this action, you need to upgrade to the Pro plan.",
            Style::default().fg(Color::Gray),
        )),
        Line::from(""),
        Line::from(Span::styled(
            "Unlock unlimited organizations, projects, and advanced features.",
            Style::default().fg(Color::DarkGray),
        )),
    ])
    .alignment(ratatui::layout::Alignment::Center)
    .wrap(Wrap { trim: true });

    frame.render_widget(message_text, chunks[3]);

    // Help text
    let help_text = Paragraph::new(vec![Line::from("Ctrl+U: upgrade | Esc: cancel")])
        .style(Style::default().fg(Color::DarkGray))
        .alignment(ratatui::layout::Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(help_text, chunks[5]);
}

pub fn handle_key_event(state: &mut AppState, key: KeyEvent) {
    if let Modal::ProPlanUpgrade = &state.modal {
        match key.code {
            KeyCode::Esc => {
                state.modal = Modal::None;
                state.message = Some(("Pro plan upgrade cancelled".to_string(), MessageType::Info));
            }
            KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                let app_config = Arc::clone(&state.app_config);
                let better_auth_url = app_config.better_auth_url.clone();
                let mut client = app_config.convex_client.clone();
                let background_task = Arc::clone(&state.background_task);
                let message_queue = Arc::clone(&state.background_messages);

                state.modal = Modal::None;

                let runtime_handle = app_config.runtime_handle.clone();
                runtime_handle.spawn(async move {
                    tracing::info!("Fetching pro plan checkout link...");

                    {
                        let mut task_guard = background_task.lock().unwrap();
                        *task_guard = Some(BackgroundTask::run(
                            "Pro Plan Checkout".to_string(),
                            "Generating secure payment link...".to_string(),
                        ));
                    }

                    let success_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
                    let bg_task_clone = Arc::clone(&background_task);
                    let success_flag_clone = Arc::clone(&success_flag);

                    let _guard = ScopeGuard::new(move || {
                        if let Ok(mut task_guard) = bg_task_clone.lock() {
                            if let Some(task) = task_guard.take() {
                                if success_flag_clone.load(std::sync::atomic::Ordering::Relaxed) {
                                    *task_guard = Some(task.success());
                                } else {
                                    *task_guard = Some(task.failed());
                                }
                            }
                        }
                    });

                    match get_pro_plan(&mut client, &better_auth_url).await {
                        Ok(response) => {
                            if let Some(checkout_link) = response.checkout_link {
                                tracing::info!("Opening pro plan checkout page...");
                                if let Err(e) = opener::open(&checkout_link) {
                                    tracing::error!("Failed to open checkout page: {}", e);
                                    message_queue.lock().unwrap().push_back((
                                        format!("Failed to open checkout page: {}", e),
                                        MessageType::Error,
                                    ));
                                } else {
                                    success_flag.store(true, std::sync::atomic::Ordering::Relaxed);

                                    message_queue.lock().unwrap().push_back((
                                        "Pro plan checkout page opened in browser".to_string(),
                                        MessageType::Success,
                                    ));
                                }
                            } else {
                                tracing::warn!("No checkout link available");
                                message_queue.lock().unwrap().push_back((
                                    "No checkout link available".to_string(),
                                    MessageType::Error,
                                ));
                            }
                        }
                        Err(e) => {
                            tracing::error!("Failed to get pro plan: {}", e);
                            message_queue.lock().unwrap().push_back((
                                format!("Failed to get pro plan: {}", e),
                                MessageType::Error,
                            ));
                        }
                    }
                });
            }
            _ => {}
        }
    }
}
