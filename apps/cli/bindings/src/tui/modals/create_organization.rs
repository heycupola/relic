use std::sync::Arc;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
};

use crate::{
    helper::{function::FunctionError, scope_guard::ScopeGuard},
    service::{
        organization::{CreateOrgArg, create_organization},
        user::{check_pro_plan, get_pro_plan, get_user_key},
    },
    tui::{
        components::{ELECTRIC_PURPLE, centered_rect},
        state::{AppState, BackgroundTask, MessageType, Modal},
    },
    util::crypto::{generate_org_key, wrap_org_key},
};

pub fn render(frame: &mut Frame, organization_name: &str, focused_field: usize, area: Rect) {
    let background = Block::default().style(Style::default().bg(Color::Black).fg(Color::DarkGray));
    frame.render_widget(background, area);

    let modal_area = centered_rect(50, 35, area);

    frame.render_widget(Clear, modal_area);

    let block = Block::default()
        .title("Create Organization")
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
            Constraint::Length(1),
            Constraint::Length(3),
            Constraint::Length(1),
            Constraint::Length(4),
            Constraint::Length(1),
            Constraint::Length(2),
        ])
        .split(inner_area);

    render_input_field(
        frame,
        chunks[1],
        "Organization Name (required)",
        organization_name,
        focused_field == 0,
    );

    let note_text = Paragraph::new(vec![
        Line::from(Span::styled(
            "Note: Organization creation requires:",
            Style::default().fg(Color::Yellow),
        )),
        Line::from("- Better-auth organization setup"),
        Line::from("- RSA key generation for encryption"),
    ])
    .style(Style::default().fg(Color::DarkGray))
    .wrap(Wrap { trim: true });

    frame.render_widget(note_text, chunks[3]);

    let help_text = Paragraph::new("Ctrl+S: create | Esc: cancel")
        .style(Style::default().fg(Color::DarkGray))
        .alignment(ratatui::layout::Alignment::Center);

    frame.render_widget(help_text, chunks[5]);
}

pub fn handle_key_event(state: &mut AppState, key: KeyEvent) {
    if let Modal::CreateOrganization {
        organization_name,
        focused_field: _,
    } = &mut state.modal
    {
        match key.code {
            KeyCode::Esc => {
                state.modal = Modal::None;
            }
            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                if organization_name.trim().is_empty() {
                    state.message = Some((
                        "Organization name cannot be empty".to_string(),
                        MessageType::Error,
                    ));
                    return;
                }

                let org_name = organization_name.clone();

                let app_config = Arc::clone(&state.app_config);
                let better_auth_url = app_config.better_auth_url.clone();
                let mut client = app_config.convex_client.clone();
                let background_task = Arc::clone(&state.background_task);
                let message_queue = Arc::clone(&state.background_messages);
                let modal_requests = Arc::clone(&state.modal_requests);

                state.modal = Modal::None;

                let runtime_handle = app_config.runtime_handle.clone();
                runtime_handle.spawn(async move {
                    tracing::info!("Starting organization creation for: {}", org_name);

                    {
                        let mut task_guard = background_task.lock().unwrap();
                        *task_guard = Some(BackgroundTask::run(
                            "Organization Creation".to_string(),
                            "Creating an organization...".to_string(),
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

                    tracing::info!("Fetching user key...");
                    let user_key = match get_user_key(&mut client, &better_auth_url).await {
                        Ok(Some(key)) => key,
                        Ok(None) => {
                            tracing::error!("No RSA keys found. Please generate keys first.");
                            message_queue.lock().unwrap().push_back((
                                "No RSA keys found. Please generate keys first.".to_string(),
                                MessageType::Error,
                            ));
                            return;
                        }
                        Err(e) => {
                            tracing::error!("Failed to get user key: {}", e);

                            let error_msg =
                                if let Some(func_err) = e.downcast_ref::<FunctionError>() {
                                    func_err.message.clone()
                                } else {
                                    format!("Failed to get user key: {}", e)
                                };

                            message_queue
                                .lock()
                                .unwrap()
                                .push_back((error_msg, MessageType::Error));
                            return;
                        }
                    };

                    tracing::info!("Generating organization encryption key...");
                    let org_key = generate_org_key();
                    let wrapped_key = match wrap_org_key(&org_key, &user_key.public_key) {
                        Ok(key) => key,
                        Err(e) => {
                            tracing::error!("Failed to wrap org key: {}", e);
                            message_queue.lock().unwrap().push_back((
                                format!("Failed to wrap org key: {}", e),
                                MessageType::Error,
                            ));
                            return;
                        }
                    };

                    let slug = org_name
                        .to_lowercase()
                        .chars()
                        .map(|c| if c.is_alphanumeric() { c } else { '-' })
                        .collect::<String>()
                        .split('-')
                        .filter(|s| !s.is_empty())
                        .collect::<Vec<_>>()
                        .join("-");

                    tracing::info!("Sending organization creation request...");
                    let response = match create_organization(
                        &mut client,
                        CreateOrgArg {
                            name: org_name.clone(),
                            slug,
                            wrapper_org_key: wrapped_key,
                        },
                        &better_auth_url,
                    )
                    .await
                    {
                        Ok(resp) => resp,
                        Err(e) => {
                            match check_pro_plan(&mut client, &better_auth_url).await {
                                Ok(check_pro_plan_response) => {
                                    if check_pro_plan_response.has_pro_plan == false {
                                        tracing::info!(
                                            "Pro plan required, opening upgrade modal..."
                                        );
                                        modal_requests
                                            .lock()
                                            .unwrap()
                                            .push_back(Modal::ProPlanUpgrade);
                                        return;
                                    }
                                }
                                Err(_) => {
                                    tracing::warn!("Failed to check pro plan status");
                                }
                            }

                            tracing::error!("Organization creation failed: {}", e);

                            let error_msg =
                                if let Some(func_err) = e.downcast_ref::<FunctionError>() {
                                    func_err.message.clone()
                                } else {
                                    format!("Organization creation failed: {}", e)
                                };

                            message_queue
                                .lock()
                                .unwrap()
                                .push_back((error_msg, MessageType::Error));
                            return;
                        }
                    };

                    if response.success {
                        success_flag.store(true, std::sync::atomic::Ordering::Relaxed);

                        let success_msg = match response.subscription_type {
                            crate::service::organization::SubscriptionType::Free => {
                                tracing::info!(
                                    "✅ Organization '{}' created successfully!",
                                    response.name
                                );
                                format!("Organization '{}' created successfully!", response.name)
                            }
                            crate::service::organization::SubscriptionType::Paid => {
                                if let Some(checkout_url) = response.checkout_url {
                                    tracing::info!(
                                        "✅ Organization '{}' created. Opening payment page...",
                                        response.name
                                    );
                                    if let Err(e) = opener::open(&checkout_url) {
                                        tracing::error!("Failed to open payment page: {}", e);
                                    }
                                    format!(
                                        "Organization '{}' created. Payment page opened.",
                                        response.name
                                    )
                                } else {
                                    tracing::warn!(
                                        "Organization created but no checkout URL received"
                                    );
                                    format!(
                                        "Organization '{}' created. Complete payment to activate.",
                                        response.name
                                    )
                                }
                            }
                        };

                        message_queue
                            .lock()
                            .unwrap()
                            .push_back((success_msg, MessageType::Success));
                    } else {
                        let error_msg = response
                            .message
                            .unwrap_or_else(|| "Unknown error".to_string());

                        tracing::error!("Failed to create organization: {}", error_msg);

                        message_queue.lock().unwrap().push_back((
                            format!("Failed to create organization: {}", error_msg),
                            MessageType::Error,
                        ));
                    }
                });
            }
            KeyCode::Char(c) => {
                organization_name.push(c);
            }
            KeyCode::Backspace => {
                organization_name.pop();
            }
            _ => {}
        }
    }
}

fn render_input_field(frame: &mut Frame, area: Rect, label: &str, value: &str, is_focused: bool) {
    let style = if is_focused {
        Style::default()
            .fg(ELECTRIC_PURPLE)
            .add_modifier(ratatui::style::Modifier::BOLD)
    } else {
        Style::default().fg(Color::Gray)
    };

    let border_style = if is_focused {
        Style::default().fg(ELECTRIC_PURPLE)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let input_text = if is_focused {
        format!("{}_", value)
    } else {
        value.to_string()
    };

    let input = Paragraph::new(input_text)
        .block(
            Block::default()
                .title(label)
                .borders(Borders::ALL)
                .border_style(border_style),
        )
        .style(style);

    frame.render_widget(input, area);
}
