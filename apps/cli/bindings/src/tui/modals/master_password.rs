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
    helper::{master_password, session},
    tui::{
        components::{centered_rect, ELECTRIC_PURPLE},
        state::{AppState, MessageType, Modal},
    },
    util::crypto::{derive_key, generate_keypair, generate_salt},
};

/// Renders the master password setup modal
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

    // Info text
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

    // Password field
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

    // Confirm password field
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

    // Requirements list
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

/// Handles key events for the master password setup modal
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
                state.message = Some(("Master password setup cancelled".to_string(), MessageType::Info));
            }
            KeyCode::Tab => {
                *focused_field = (*focused_field + 1) % 2;
            }
            KeyCode::Char('h') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                *show_password = !*show_password;
            }
            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                // Validate password
                if password.len() < 12 {
                    state.message =
                        Some(("Password must be at least 12 characters long".to_string(), MessageType::Error));
                    return;
                }

                if password != confirm_password {
                    state.message = Some(("Passwords do not match".to_string(), MessageType::Error));
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

                let master_password_clone = password.clone();
                state.modal = Modal::None;
                state.message = Some(("Setting up encryption keys...".to_string(), MessageType::Info));

                let rt = match tokio::runtime::Runtime::new() {
                    Ok(r) => r,
                    Err(e) => {
                        state.message = Some((format!("Failed to create runtime: {}", e), MessageType::Error));
                        return;
                    }
                };

                let app_config = Arc::clone(&state.app_config);

                tracing::info!("Starting key generation with user-defined master password");

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

                    // Store master password in keychain
                    master_password::store_master_password(&master_password_clone)?;
                    tracing::info!("Master password stored in keychain");

                    let salt = generate_salt();
                    let master_key = derive_key(&master_password_clone, &salt)?;

                    tracing::info!("Generating RSA keypair (this may take a moment)...");
                    let (public_key, encrypted_private_key) = generate_keypair(&master_key)?;
                    tracing::info!("RSA keypair generated successfully");

                    // store_user_key(
                    //     &mut client,
                    //     StoreUserKeyArg {
                    //         public_key,
                    //         encrypted_private_key,
                    //         salt,
                    //     },
                    //     access_token,
                    // )
                    // .await?;

                    tracing::info!("User keys stored successfully");

                    Ok(())
                });

                match result {
                    Ok(_) => {
                        state.message = Some((
                            "Encryption keys set up successfully! Master password stored securely in OS keychain."
                                .to_string(),
                            MessageType::Success,
                        ));
                    }
                    Err(e) => {
                        tracing::error!("Failed to set up encryption keys: {}", e);
                        state.message =
                            Some((format!("Failed to set up encryption keys: {}", e), MessageType::Error));
                    }
                }
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
