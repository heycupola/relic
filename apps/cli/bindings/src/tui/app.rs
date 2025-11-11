use std::{
    io,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{
    Frame, Terminal,
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    prelude::CrosstermBackend,
    style::{Color, Style},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
};

use crate::{
    helper::{device_cache, session},
    service::auth::{
        DeviceAuthError, PollDeviceTokenArg, RequestDeviceCodeArg, poll_device_code,
        request_device_code,
    },
    tui::{
        components::{centered_rect, render_status_bar},
        modals::{handle_modal_key_event, render_modal},
        screens::{handle_screen_key_event, render_screen},
        state::{AppState, MessageType, Modal},
    },
    util::app_config::AppConfig,
};

static TERMINAL: Mutex<Option<Terminal<CrosstermBackend<io::Stdout>>>> = Mutex::new(None);

pub fn start_tui(app_config: AppConfig) {
    if let Err(e) = enable_raw_mode() {
        eprintln!("Failed to enable raw mode: {}", e);
        return;
    }

    let mut stdout = io::stdout();
    if let Err(e) = execute!(stdout, EnterAlternateScreen) {
        eprintln!("Failed to enter alternate screen: {}", e);
        let _ = disable_raw_mode();
        return;
    }

    let backend = CrosstermBackend::new(stdout);
    let terminal = match Terminal::new(backend) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("Failed to create terminal: {}", e);
            cleanup_tui();
            return;
        }
    };
    *TERMINAL.lock().unwrap() = Some(terminal);

    let state = Arc::new(Mutex::new(AppState::new(app_config)));

    ctrlc::set_handler(|| {
        *TERMINAL.lock().unwrap() = None;
    })
    .expect("Error setting Ctrl-C handler");

    let state_clone = Arc::clone(&state);
    let handle = thread::spawn(move || {
        loop {
            if TERMINAL.lock().unwrap().is_none() {
                break;
            }

            let should_quit = {
                let state_lock = state.lock().unwrap();
                state_lock.should_quit
            };

            if should_quit {
                break;
            }

            {
                let mut state_lock = state.lock().unwrap();
                poll_device_flow(&mut state_lock);

                // NOTE: check if background task should be dismissed (3 second timeout for success/failed)
                let should_dismiss = {
                    if let Ok(task_guard) = state_lock.background_task.lock() {
                        task_guard
                            .as_ref()
                            .map(|task| task.should_dismiss(3))
                            .unwrap_or(false)
                    } else {
                        false
                    }
                };

                if should_dismiss {
                    if let Ok(mut task_guard) = state_lock.background_task.lock() {
                        *task_guard = None;
                    }
                }

                if state_lock.background_task.lock().unwrap().is_none() {
                    // Process modal requests first
                    if state_lock.modal == Modal::None {
                        let modal_request = {
                            if let Ok(mut queue) = state_lock.modal_requests.lock() {
                                queue.pop_front()
                            } else {
                                None
                            }
                        };

                        if let Some(modal) = modal_request {
                            state_lock.modal = modal;
                        }
                    }

                    // Then process messages
                    let msg = {
                        if let Ok(mut queue) = state_lock.background_messages.lock() {
                            queue.pop_front()
                        } else {
                            None
                        }
                    };

                    if let Some(msg) = msg {
                        state_lock.message = Some(msg)
                    }

                    if state_lock.message.is_none() {
                        check_master_password(&mut state_lock);
                    }
                }
            }

            if let Some(terminal) = TERMINAL.lock().unwrap().as_mut() {
                let mut state_lock = state.lock().unwrap();

                terminal
                    .draw(|f| {
                        let area = f.area();

                        // Check if we have a background task to display
                        let has_status_bar = state_lock.background_task.lock().unwrap().is_some();

                        let chunks = Layout::default()
                            .direction(Direction::Vertical)
                            .constraints(if has_status_bar {
                                [Constraint::Min(0), Constraint::Length(1)]
                            } else {
                                [Constraint::Min(0), Constraint::Length(0)]
                            })
                            .split(area);

                        render_screen(f, &mut state_lock);
                        render_modal(f, &state_lock, chunks[0]);
                        render_message(f, &state_lock, chunks[0]);

                        if has_status_bar {
                            if let Ok(task_guard) = state_lock.background_task.lock() {
                                if let Some(ref task) = *task_guard {
                                    render_status_bar(f, task, chunks[1]);
                                }
                            }
                        }
                    })
                    .ok();
            }

            if event::poll(Duration::from_millis(100)).unwrap_or(false)
                && let Ok(Event::Key(key)) = event::read()
            {
                let mut state_lock = state_clone.lock().unwrap();
                handle_key_event(&mut state_lock, key);
            }

            thread::sleep(Duration::from_millis(16));
        }
    });

    handle.join().ok();
    cleanup_tui();
}

fn handle_key_event(state: &mut AppState, key: KeyEvent) {
    if key.code == KeyCode::Esc && state.message.is_some() {
        state.message = None;
        return;
    }

    if key.code == KeyCode::Char('q') && state.modal == Modal::None {
        state.should_quit = true;
        return;
    }

    match &state.modal {
        Modal::None => {
            if handle_screen_key_event(state, key) {
                start_device_flow(state);
            }
        }
        _ => handle_modal_key_event(state, key),
    }
}

fn start_device_flow(state: &mut AppState) {
    if let Ok(Some(cached)) = device_cache::load_device_code() {
        if let Err(e) = opener::open(&cached.verification_uri_complete) {
            state.message = Some((format!("Failed to open browser: {}", e), MessageType::Error));
            return;
        }

        state.modal = Modal::DeviceCodeAuth {
            user_code: cached.user_code.clone(),
            redirect_url: cached.verification_uri_complete.clone(),
        };

        state.last_device_poll = Some(std::time::SystemTime::now());

        return;
    }

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            state.message = Some((
                format!("Failed to create runtime: {}", e),
                MessageType::Error,
            ));
            return;
        }
    };

    let app_config = Arc::clone(&state.app_config);

    let result = rt.block_on(async {
        let mut client = app_config.convex_client.clone();
        request_device_code(
            &mut client,
            RequestDeviceCodeArg {
                client_id: app_config.client_id.clone(),
                scope: None,
            },
        )
        .await
    });

    match result {
        Ok(response) => {
            if let Err(e) = opener::open(&response.verification_uri_complete) {
                state.message =
                    Some((format!("Failed to open browser: {}", e), MessageType::Error));
                return;
            }

            let expires_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + response.expires_in;

            let cache = device_cache::DeviceCodeCache::new(
                response.device_code.clone(),
                response.user_code.clone(),
                response.verification_uri.clone(),
                response.verification_uri_complete.clone(),
                expires_at,
                response.interval,
            );

            if let Err(e) = device_cache::save_device_code(cache) {
                eprintln!("Warning: Failed to cache device code: {}", e);
            }

            state.modal = Modal::DeviceCodeAuth {
                user_code: response.user_code.clone(),
                redirect_url: response.verification_uri_complete.clone(),
            };

            state.last_device_poll = Some(std::time::SystemTime::now());
        }
        Err(e) => {
            state.message = Some((format!("Device auth failed: {}", e), MessageType::Error));
        }
    }
}

fn poll_device_flow(state: &mut AppState) {
    if !matches!(state.modal, Modal::DeviceCodeAuth { .. }) {
        return;
    }

    tracing::debug!("poll_device_flow: Checking device auth modal");

    let cached = match device_cache::load_device_code() {
        Ok(Some(c)) => {
            tracing::debug!("poll_device_flow: Loaded cached device code");
            c
        }
        Ok(None) => {
            tracing::warn!("poll_device_flow: No cached device code found");
            state.modal = Modal::None;
            state.last_device_poll = None;
            return;
        }
        Err(e) => {
            tracing::error!("poll_device_flow: Failed to load device code: {}", e);
            state.modal = Modal::None;
            state.last_device_poll = None;
            return;
        }
    };

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    if now_secs >= cached.expires_at {
        tracing::warn!("poll_device_flow: Device code expired");
        device_cache::delete_device_code().ok();
        state.message = Some((
            "Device code expired. Please try again.".to_string(),
            MessageType::Error,
        ));
        state.modal = Modal::None;
        state.last_device_poll = None;
        return;
    }

    if let Some(last_poll) = state.last_device_poll {
        let elapsed = std::time::SystemTime::now()
            .duration_since(last_poll)
            .unwrap_or_default();

        if elapsed.as_secs() < cached.interval {
            tracing::trace!(
                "poll_device_flow: Skipping poll (interval: {}s, elapsed: {}s)",
                cached.interval,
                elapsed.as_secs()
            );
            return;
        }
    }

    tracing::info!("poll_device_flow: Polling device token endpoint");
    state.last_device_poll = Some(std::time::SystemTime::now());

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("poll_device_flow: Failed to create runtime: {}", e);
            return;
        }
    };

    let app_config = Arc::clone(&state.app_config);
    let device_code = cached.device_code.clone();

    let result = rt.block_on(async {
        let mut client = app_config.convex_client.clone();
        poll_device_code(&mut client, PollDeviceTokenArg { device_code }).await
    });

    match result {
        Ok(token_response) => {
            tracing::info!("poll_device_flow: ✅ Device authentication successful!");

            let expires_at_timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + token_response.expires_in;

            let new_session = session::Session::new(
                token_response.session_token.clone(),
                token_response.token_type,
                expires_at_timestamp,
            );

            tracing::info!("poll_device_flow: Saving session...");
            if let Err(e) = session::save_session(new_session) {
                tracing::error!("poll_device_flow: Failed to save session: {}", e);
                state.message =
                    Some((format!("Failed to save session: {}", e), MessageType::Error));
            } else {
                tracing::info!("poll_device_flow: Session saved successfully");
                device_cache::delete_device_code().ok();
                state.last_device_poll = None;
                state.current_screen = crate::tui::screens::Screen::Home;

                tracing::info!("poll_device_flow: Login flow completed successfully");
            }
        }
        Err(e) => {
            tracing::debug!("poll_device_flow: Poll returned error: {}", e);
            match DeviceAuthError::from_anyhow_error(&e) {
                Some(DeviceAuthError::AuthorizationPending) => {
                    tracing::trace!("poll_device_flow: Authorization pending, will retry");
                }
                Some(DeviceAuthError::AccessDenied) => {
                    tracing::warn!("poll_device_flow: Access denied");
                    device_cache::delete_device_code().ok();
                    state.message = Some((
                        "Access denied. Authorization was rejected.".to_string(),
                        MessageType::Error,
                    ));
                    state.modal = Modal::None;
                    state.last_device_poll = None;
                }
                Some(DeviceAuthError::ExpiredToken) => {
                    tracing::warn!("poll_device_flow: Expired token");
                    device_cache::delete_device_code().ok();
                    state.message = Some((
                        "Device code expired. Please try again.".to_string(),
                        MessageType::Error,
                    ));
                    state.modal = Modal::None;
                    state.last_device_poll = None;
                }
                Some(DeviceAuthError::InvalidGrant) => {
                    tracing::warn!("poll_device_flow: Invalid grant");
                    device_cache::delete_device_code().ok();
                    state.message = Some((
                        "Invalid device code. Please try again.".to_string(),
                        MessageType::Error,
                    ));
                    state.modal = Modal::None;
                    state.last_device_poll = None;
                }
                None => {
                    tracing::error!("poll_device_flow: Unknown error: {}", e);
                }
            }
        }
    }
}

fn check_master_password(state: &mut AppState) {
    if !state.is_logged_in() {
        return;
    }

    if !matches!(state.modal, Modal::None) {
        return;
    }

    if !state
        .mp_guard
        .is_available()
        .expect("Unable to check master password availability")
    {
        tracing::info!("No master password found");
        state.modal = Modal::MasterPasswordSetup {
            password: String::new(),
            confirm_password: String::new(),
            focused_field: 0,
            show_password: false,
        };
        state.message = Some((
            "Please set up your master password to continue.".to_string(),
            crate::tui::state::MessageType::Info,
        ));
    }
}

fn render_message(frame: &mut Frame, state: &AppState, area: Rect) {
    if let Some((message_text, message_type)) = &state.message {
        let background = Block::default().style(Style::default().bg(Color::Black).fg(Color::DarkGray));
        frame.render_widget(background, area);

        let message_area = centered_rect(40, 20, area);

        frame.render_widget(Clear, message_area);

        let (title, color) = match message_type {
            MessageType::Success => ("✓ Success", Color::Green),
            MessageType::Error => ("✗ Error", Color::Red),
            MessageType::Info => ("ℹ Info", Color::Cyan),
        };

        let message_block = Block::default()
            .title(title)
            .borders(Borders::ALL)
            .border_style(Style::default().fg(color));

        frame.render_widget(message_block, message_area);

        let inner_area = Rect {
            x: message_area.x + 2,
            y: message_area.y + 2,
            width: message_area.width - 4,
            height: message_area.height - 4,
        };

        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Min(1),
                Constraint::Length(1),
            ])
            .split(inner_area);

        let message_para = Paragraph::new(message_text.as_str())
            .style(Style::default().fg(color))
            .alignment(Alignment::Center)
            .wrap(Wrap { trim: true });

        frame.render_widget(message_para, chunks[1]);
    }
}

fn cleanup_tui() {
    if TERMINAL.lock().unwrap().take().is_some() {
        disable_raw_mode().ok();
        execute!(io::stdout(), LeaveAlternateScreen).ok();
    }
}
