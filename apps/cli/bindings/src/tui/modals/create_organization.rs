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
    helper::session,
    service::{
        organization::{CreateOrgArg, create_organization},
        user::get_user_key,
    },
    tui::{
        components::{centered_rect, ELECTRIC_PURPLE},
        state::{AppState, MessageType, Modal},
    },
    util::crypto::{generate_org_key, wrap_org_key},
};

/// Renders the create organization modal
pub fn render(frame: &mut Frame, organization_name: &str, focused_field: usize, area: Rect) {
    let modal_area = centered_rect(60, 40, area);

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
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(1),
            Constraint::Length(2),
        ])
        .split(inner_area);

    render_input_field(
        frame,
        chunks[0],
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

    frame.render_widget(note_text, chunks[1]);

    let help_text =
        Paragraph::new("Ctrl+S: create | Esc: cancel").style(Style::default().fg(Color::DarkGray));

    frame.render_widget(help_text, chunks[3]);
}

/// Handles key events for the create organization modal
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
                    state.message = Some(("Organization name cannot be empty".to_string(), MessageType::Error));
                    return;
                }

                let org_name = organization_name.clone();
                state.modal = Modal::None;
                state.message = Some(("Creating organization...".to_string(), MessageType::Info));

                let rt = match tokio::runtime::Runtime::new() {
                    Ok(r) => r,
                    Err(e) => {
                        state.message = Some((format!("Failed to create runtime: {}", e), MessageType::Error));
                        return;
                    }
                };

                let app_config = Arc::clone(&state.app_config);

                tracing::info!("Starting organization creation for: {}", org_name);

                let result = rt.block_on(async {
                    let mut client = app_config.convex_client.clone();

                    let access_token = match session::get_token() {
                        Ok(Some(token)) => token,
                        Ok(None) => {
                            return Err(anyhow::anyhow!("Not logged in. Please login first."));
                        }
                        Err(e) => {
                            return Err(anyhow::anyhow!("Failed to get session token: {}", e));
                        }
                    };

                    tracing::info!("Fetching user key...");
                    let user_key = match get_user_key(&mut client, access_token.clone()).await {
                        Ok(Some(key)) => key,
                        Ok(None) => {
                            return Err(anyhow::anyhow!(
                                "No RSA keys found. Please generate keys first."
                            ));
                        }
                        Err(e) => {
                            return Err(anyhow::anyhow!("Failed to get user key: {}", e));
                        }
                    };

                    tracing::info!("Generating organization key...");
                    let org_key = generate_org_key();

                    tracing::info!("Wrapping organization key with user's public key...");
                    let wrapped_key = match wrap_org_key(&org_key, &user_key.public_key) {
                        Ok(key) => key,
                        Err(e) => {
                            return Err(anyhow::anyhow!("Failed to wrap org key: {}", e));
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
                    let response = create_organization(
                        &mut client,
                        CreateOrgArg {
                            name: org_name.clone(),
                            slug,
                            wrapper_org_key: wrapped_key,
                        },
                        access_token.clone(),
                    )
                    .await?;

                    tracing::info!("Organization created: {:?}", response);
                    Ok(response)
                });

                match result {
                    Ok(response) => {
                        if response.success {
                            match response.subscription_type {
                                crate::service::organization::SubscriptionType::Free => {
                                    state.message = Some((format!(
                                        "Organization '{}' created successfully!",
                                        response.name
                                    ), MessageType::Success));
                                }
                                crate::service::organization::SubscriptionType::Paid => {
                                    if let Some(checkout_url) = response.checkout_url {
                                        if let Err(e) = opener::open(&checkout_url) {
                                            state.message = Some((format!(
                                                "Organization created but failed to open payment page: {}",
                                                e
                                            ), MessageType::Error));
                                        } else {
                                            state.message = Some((format!(
                                                "Organization '{}' created. Complete payment in browser.",
                                                response.name
                                            ), MessageType::Success));
                                        }
                                    } else {
                                        state.message = Some((
                                            "Organization created but no checkout URL received"
                                                .to_string(),
                                            MessageType::Info,
                                        ));
                                    }
                                }
                            }
                        } else {
                            state.message = Some((format!(
                                "Failed to create organization: {}",
                                response
                                    .message
                                    .unwrap_or_else(|| "Unknown error".to_string())
                            ), MessageType::Error));
                        }
                    }
                    Err(e) => {
                        tracing::error!("Organization creation failed: {}", e);
                        state.message = Some((format!("Failed to create organization: {}", e), MessageType::Error));
                    }
                }
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

// Helper function

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
