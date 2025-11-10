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
    helper::{master_password, scope_guard::ScopeGuard},
    service::user::{StoreUserKeyArg, get_user_key, store_user_key},
    tui::{
        components::{ELECTRIC_PURPLE, centered_rect},
        state::{AppState, MessageType, Modal},
    },
    util::crypto::{
        decrypt_private_key, derive_key, extract_public_key_from_rsa_private_key, generate_keypair,
        generate_salt,
    },
};

pub fn render(
    frame: &mut Frame,
    password: &str,
    confirm_password: &str,
    focused_field: usize,
    show_password: bool,
    area: Rect,
) {
    let modal_area = centered_rect(70, 60, area);

    frame.render_widget(Clear, modal_area);

    let block = Block::default()
        .title("Master Password Setup")
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
            Constraint::Length(4), // Info text
            Constraint::Length(3), // Password field
            Constraint::Length(3), // Confirm password field
            Constraint::Length(5), // Requirements list
            Constraint::Min(1),    // Spacer
            Constraint::Length(2), // Help text
        ])
        .split(inner_area);

    let info_text = Paragraph::new(vec![
        Line::from(Span::styled(
            "🔐 Create Your Master Password",
            Style::default().fg(ELECTRIC_PURPLE).add_modifier(Modifier::BOLD),
        )),
        Line::from(""),
        Line::from(Span::styled(
            "This password will encrypt your encryption keys. It will be stored",
            Style::default().fg(Color::Gray),
        )),
        Line::from(Span::styled(
            "securely in your OS keychain (macOS Keychain/Windows Credential Manager/Linux keyutils).",
            Style::default().fg(Color::Gray),
        )),
    ])
    .wrap(Wrap { trim: true });

    frame.render_widget(info_text, chunks[0]);

    let password_display = if show_password {
        password.to_string()
    } else {
        "•".repeat(password.len())
    };
    render_password_input_field(
        frame,
        chunks[1],
        "Master Password",
        &password_display,
        focused_field == 0,
    );

    let confirm_display = if show_password {
        confirm_password.to_string()
    } else {
        "•".repeat(confirm_password.len())
    };
    render_password_input_field(
        frame,
        chunks[2],
        "Confirm Password",
        &confirm_display,
        focused_field == 1,
    );

    let password_strength = get_password_strength(password);
    let passwords_match =
        !password.is_empty() && !confirm_password.is_empty() && password == confirm_password;

    let req_lines = vec![
        Line::from(vec![
            Span::styled(
                if password.len() >= 12 { "✓" } else { "✗" },
                Style::default().fg(if password.len() >= 12 {
                    Color::Green
                } else {
                    Color::Red
                }),
            ),
            Span::raw(" At least 12 characters"),
        ]),
        Line::from(vec![
            Span::styled(
                if passwords_match { "✓" } else { "✗" },
                Style::default().fg(if passwords_match {
                    Color::Green
                } else {
                    Color::Red
                }),
            ),
            Span::raw(" Passwords match"),
        ]),
        Line::from(vec![
            Span::styled(
                if password_strength >= 2 { "✓" } else { "✗" },
                Style::default().fg(if password_strength >= 2 {
                    Color::Green
                } else {
                    Color::Red
                }),
            ),
            Span::raw(" Contains mix of characters (uppercase, lowercase, numbers, symbols)"),
        ]),
    ];

    let requirements = Paragraph::new(req_lines)
        .style(Style::default().fg(Color::Gray))
        .block(
            Block::default()
                .title("Requirements")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray)),
        );

    frame.render_widget(requirements, chunks[3]);

    // Help text
    let help_text = Paragraph::new(vec![Line::from(
        "Tab: next field | Ctrl+H: toggle visibility | Ctrl+S: save | Esc: cancel",
    )])
    .style(Style::default().fg(Color::DarkGray))
    .wrap(Wrap { trim: true });

    frame.render_widget(help_text, chunks[5]);
}

pub fn handle_key_event(state: &mut AppState, key: KeyEvent) {
    if let Modal::MasterPasswordSetup {
        password,
        confirm_password,
        focused_field,
        show_password,
    } = &mut state.modal
    {
        match key.code {
            KeyCode::Esc => {
                state.modal = Modal::None;
                state.message = Some((
                    "Master password setup cancelled".to_string(),
                    MessageType::Info,
                ));
            }
            KeyCode::Tab => {
                *focused_field = (*focused_field + 1) % 2;
            }
            KeyCode::Char('h') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                *show_password = !*show_password;
            }
            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                if password.len() < 12 {
                    state.message = Some((
                        "Password must be at least 12 characters long".to_string(),
                        MessageType::Error,
                    ));
                    return;
                }

                if password != confirm_password {
                    state.message =
                        Some(("Passwords do not match".to_string(), MessageType::Error));
                    return;
                }

                let password_strength = password
                    .chars()
                    .fold(0u8, |acc, c| acc + if c.is_lowercase() { 1 } else { 0 })
                    + password
                        .chars()
                        .fold(0u8, |acc, c| acc + if c.is_uppercase() { 1 } else { 0 })
                    + password
                        .chars()
                        .fold(0u8, |acc, c| acc + if c.is_ascii_digit() { 1 } else { 0 })
                    + password
                        .chars()
                        .fold(0u8, |acc, c| acc + if !c.is_alphanumeric() { 1 } else { 0 });

                if password_strength < 2 {
                    state.message = Some((
                        "Password must contain a mix of character types (uppercase, lowercase, numbers, symbols)".to_string(),
                        MessageType::Error,
                    ));
                    return;
                }

                let app_config = Arc::clone(&state.app_config);

                let mut client = app_config.convex_client.clone();
                let better_auth_url = app_config.better_auth_url.clone();
                let master_password_clone = password.clone();
                let message_queue = Arc::clone(&state.background_messages);
                let background_task_running = Arc::clone(&state.background_task_running);

                state.modal = Modal::None;
                state.message = Some((
                    "Setting up encryption keys...".to_string(),
                    MessageType::Info,
                ));

                // DON'T use block_on - just spawn the task and let it run in the background
                // The mutation will work because auth is already set on the client
                let runtime_handle = app_config.runtime_handle.clone();
                runtime_handle.spawn(async move {
                    tracing::info!("Checking if user already has keys...");

                    *background_task_running.lock().unwrap() = true;

                    // guard ensures background_task_running is reset to false when scope exits
                    let bg_flag = Arc::clone(&background_task_running);
                    let _guard = ScopeGuard::new(move || {
                        *bg_flag.lock().unwrap() = false;
                        tracing::info!("Background task finished, flag reset");
                    });

                    let existing_key = match get_user_key(&mut client, &better_auth_url).await {
                        Ok(key) => key,
                        Err(e) => {
                            tracing::error!("Failed to check existing keys: {}", e);
                            message_queue.lock().unwrap().push_back((
                                format!("Failed to check existing keys: {}", e),
                                MessageType::Error,
                            ));
                            return;
                        }
                    };

                    if let Some(existing) = existing_key {
                        tracing::info!("Existing keys found, verifying master password...");

                        let master_key = match derive_key(&master_password_clone, &existing.salt) {
                            Ok(key) => key,
                            Err(e) => {
                                tracing::error!("Failed to derive master key: {}", e);
                                message_queue.lock().unwrap().push_back((
                                    format!("Failed to derive master key: {}", e),
                                    MessageType::Error
                                ));
                                return;
                            }
                        };

                        match decrypt_private_key(
                            &existing.encrypted_private_key,
                            &master_key
                        ) {
                            Ok(_decrypted_private_key) => {
                                tracing::info!("Master password verified successfully!"); 

                                tracing::info!("✅ Public keys match! Password is correct and was used for encryption.");

                                if let Err(e) =
                                    master_password::store_master_password(&master_password_clone)
                                {
                                    tracing::error!("Failed to store master password: {}", e);
                                    message_queue.lock().unwrap().push_back((
                                        format!("Failed to store master password: {}", e),
                                        MessageType::Error,
                                     ));
                                    return;
                                }

                                message_queue.lock().unwrap().push_back((
                                    "Master password verified and stored successfully!".to_string(),
                                    MessageType::Success,
                                 ));
                            }
                            Err(_e) => {
                                // NOTE: IMPLEMENT KEY ROTATION
                                tracing::warn!("⚠️ Public keys don't match! This password was never used for encryption.");
                                message_queue.lock().unwrap().push_back((
                                    "Warning: This password was never used to encrypt your data. All your secrets will require key rotation.".to_string(),
                                    MessageType::Error,
                                ));
                            }
                        };
                    } else {
                        tracing::info!("No existing keys found, creating new keys...");

                        if let Err(e) = master_password::store_master_password(&master_password_clone) {
                            tracing::error!("Failed to store master password: {}", e);
                            message_queue.lock().unwrap().push_back((
                                format!("Failed to store master password: {}", e),
                                MessageType::Error,
                            ));
                            return;
                        }
                        tracing::info!("Master password stored in keychain!");

                        tracing::info!("Genetaring user keys...");
                        let salt = generate_salt();
                        let master_key = match derive_key(&master_password_clone, &salt) {
                            Ok(key) => key,
                            Err(e) => {
                                tracing::error!("Failed to derive master key: {}", e);
                                message_queue.lock().unwrap().push_back((
                                    format!("Failed to derive encryption key: {}", e),
                                    MessageType::Error
                                ));
                                return;
                            }
                        };

                        let (public_key, encrypted_private_key) = match generate_keypair(&master_key) {
                            Ok(keys) => keys,
                            Err(e) => {
                                tracing::error!("Failed to generate keypair: {}", e);
                                message_queue.lock().unwrap().push_back((
                                    format!("Failed to generate keypair: {}", e),
                                    MessageType::Error,
                                ));
                                return;
                            }
                        };
                        tracing::info!("User keys generated!");

                        match store_user_key(
                            &mut client,
                            StoreUserKeyArg {
                                public_key,
                                encrypted_private_key,
                                salt,
                            },
                            &better_auth_url,
                        )
                        .await
                        {
                            Ok(_) => {
                                tracing::info!("✅ User keys stored successfully!");
                                message_queue.lock().unwrap().push_back((
                                    "Encryption keys created successfully!".to_string(),
                                    MessageType::Success,
                                ));
                            }
                            Err(e) => {
                                tracing::error!("Failed to store user keys: {}", e);
                                message_queue.lock().unwrap().push_back((
                                    format!("Failed to store keys: {}", e),
                                    MessageType::Error,
                                ));
                            }
                        }
                    }
                });

                state.message = Some((
                    "Encryption keys being set up in background...".to_string(),
                    MessageType::Success,
                ));
            }
            KeyCode::Char(c) => {
                let target = match *focused_field {
                    0 => password,
                    1 => confirm_password,
                    _ => return,
                };
                target.push(c);
            }
            KeyCode::Backspace => {
                let target = match *focused_field {
                    0 => password,
                    1 => confirm_password,
                    _ => return,
                };
                target.pop();
            }
            _ => {}
        }
    }
}

// Helper functions

fn render_password_input_field(
    frame: &mut Frame,
    area: Rect,
    label: &str,
    value: &str,
    is_focused: bool,
) {
    let style = if is_focused {
        Style::default()
            .fg(ELECTRIC_PURPLE)
            .add_modifier(Modifier::BOLD)
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

fn get_password_strength(password: &str) -> u8 {
    let mut strength = 0;

    if password.chars().any(|c| c.is_lowercase()) {
        strength += 1;
    }
    if password.chars().any(|c| c.is_uppercase()) {
        strength += 1;
    }
    if password.chars().any(|c| c.is_ascii_digit()) {
        strength += 1;
    }
    if password.chars().any(|c| !c.is_alphanumeric()) {
        strength += 1;
    }

    strength
}
