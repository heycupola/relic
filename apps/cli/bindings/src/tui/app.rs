use std::{
    io,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyModifiers},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{Terminal, prelude::CrosstermBackend};

use crate::{
    helper::{device_cache, session},
    service::auth::{
        DeviceAuthError, PollDeviceTokenArg, RequestDeviceCodeArg, poll_device_code,
        request_device_code,
    },
    tui::{
        home::render_home_screen,
        modal::render_modal,
        project_screen::render_project_screen,
        screen::{ProjectScreenData, Screen},
        state::{AppState, Modal},
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
            }

            if let Some(terminal) = TERMINAL.lock().unwrap().as_mut() {
                let state_lock = state.lock().unwrap();

                terminal
                    .draw(|f| {
                        match &state_lock.current_screen {
                            Screen::Home => {
                                render_home_screen(f, &state_lock);
                            }
                            Screen::Project(project_data) => {
                                render_project_screen(f, &state_lock, project_data);
                            }
                        }

                        render_modal(f, &state_lock, f.area());
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
    if key.code == KeyCode::Char('q') && state.modal == Modal::None {
        state.should_quit = true;
        return;
    }

    match &state.modal {
        Modal::None => handle_screen_key_event(state, key),
        Modal::ScopeSelector { .. } => handle_scope_selector_key_event(state, key),
        Modal::CreateProject { .. } => handle_create_project_key_event(state, key),
        Modal::CreateOrganization { .. } => handle_create_org_key_event(state, key),
        Modal::DeviceCodeAuth { .. } => handle_device_code_key_event(state, key),
    }
}

fn handle_screen_key_event(state: &mut AppState, key: KeyEvent) {
    match &state.current_screen {
        Screen::Home => handle_home_key_event(state, key),
        Screen::Project(_) => handle_project_screen_key_event(state, key),
    }
}

fn handle_home_key_event(state: &mut AppState, key: KeyEvent) {
    if !state.is_logged_in() {
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if state.login_selected_index > 0 {
                    state.login_selected_index -= 1;
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                let options = AppState::get_login_options();
                if state.login_selected_index < options.len() - 1 {
                    state.login_selected_index += 1;
                }
            }
            KeyCode::Enter => {
                start_device_flow(state);
            }
            _ => {}
        }
    } else {
        match key.code {
            KeyCode::Char('s') => {
                state.modal = Modal::ScopeSelector { selected_index: 0 };
            }
            KeyCode::Char('n') => {
                state.modal = Modal::CreateProject {
                    name: String::new(),
                    slug: String::new(),
                    description: String::new(),
                    focused_field: 0,
                };
            }
            KeyCode::Char('o') => {
                state.modal = Modal::CreateOrganization {
                    organization_name: String::new(),
                    focused_field: 0,
                };
            }
            KeyCode::Up | KeyCode::Char('k') => {
                if !state.projects.is_empty() && state.selected_project_index > 0 {
                    state.selected_project_index -= 1;
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if !state.projects.is_empty()
                    && state.selected_project_index < state.projects.len() - 1
                {
                    state.selected_project_index += 1;
                }
            }
            KeyCode::Enter => {
                if let Some(project) = state.projects.get(state.selected_project_index) {
                    state.current_screen = Screen::Project(ProjectScreenData {
                        project_id: project.id.clone(),
                        project_name: project.name.clone(),
                        project_slug: project.slug.clone(),
                        project_description: project.description.clone(),
                        owner_type: "personal".to_string(),
                        owner_id: "".to_string(),
                        created_at: project.created_at,
                        updated_at: project.updated_at,
                    });
                }
            }
            _ => {}
        }
    }
}

fn handle_project_screen_key_event(state: &mut AppState, key: KeyEvent) {
    match key.code {
        KeyCode::Esc | KeyCode::Char('b') => {
            state.current_screen = Screen::Home;
        }
        _ => {}
    }
}

fn handle_scope_selector_key_event(state: &mut AppState, key: KeyEvent) {
    if let Modal::ScopeSelector { selected_index } = &mut state.modal {
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if *selected_index > 0 {
                    *selected_index -= 1;
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if *selected_index < state.available_scopes.len() - 1 {
                    *selected_index += 1;
                }
            }
            KeyCode::Enter => {
                if let Some(scope) = state.available_scopes.get(*selected_index).cloned() {
                    state.current_scope = scope;
                    state.modal = Modal::None;
                    state.selected_project_index = 0;
                }
            }
            KeyCode::Esc => {
                state.modal = Modal::None;
            }
            _ => {}
        }
    }
}

fn handle_device_code_key_event(state: &mut AppState, key: KeyEvent) {
    match key.code {
        KeyCode::Esc => {
            state.modal = Modal::None;
            state.last_device_poll = None;
        }
        _ => {}
    }
}

fn handle_create_project_key_event(state: &mut AppState, key: KeyEvent) {
    if let Modal::CreateProject {
        name,
        slug,
        description,
        focused_field,
    } = &mut state.modal
    {
        match key.code {
            KeyCode::Esc => {
                state.modal = Modal::None;
            }
            KeyCode::Tab => {
                if key.modifiers.contains(KeyModifiers::SHIFT) {
                    if *focused_field > 0 {
                        *focused_field -= 1;
                    }
                } else {
                    if *focused_field < 2 {
                        *focused_field += 1;
                    }
                }
            }
            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                state.error_message = Some(
                    "Project creation not yet implemented (backend integration needed)".to_string(),
                );
                state.modal = Modal::None;
            }
            KeyCode::Char(c) => {
                let target = match *focused_field {
                    0 => name,
                    1 => slug,
                    2 => description,
                    _ => return,
                };
                target.push(c);
            }
            KeyCode::Backspace => {
                let target = match *focused_field {
                    0 => name,
                    1 => slug,
                    2 => description,
                    _ => return,
                };
                target.pop();
            }
            _ => {}
        }
    }
}

fn handle_create_org_key_event(state: &mut AppState, key: KeyEvent) {
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
                state.error_message = Some(
                    "Organization creation not yet implemented (requires crypto setup)".to_string(),
                );
                state.modal = Modal::None;
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

fn start_device_flow(state: &mut AppState) {
    if let Ok(Some(cached)) = device_cache::load_device_code() {
        if let Err(e) = opener::open(&cached.verification_uri_complete) {
            state.error_message = Some(format!("Failed to open browser: {}", e));
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
            state.error_message = Some(format!("Failed to create runtime: {}", e));
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
                state.error_message = Some(format!("Failed to open browser: {}", e));
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
            state.error_message = Some(format!("Device auth failed: {}", e));
        }
    }
}

fn poll_device_flow(state: &mut AppState) {
    if !matches!(state.modal, Modal::DeviceCodeAuth { .. }) {
        return;
    }

    let cached = match device_cache::load_device_code() {
        Ok(Some(c)) => c,
        _ => {
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
        device_cache::delete_device_code().ok();
        state.error_message = Some("Device code expired. Please try again.".to_string());
        state.modal = Modal::None;
        state.last_device_poll = None;
        return;
    }

    if let Some(last_poll) = state.last_device_poll {
        let elapsed = std::time::SystemTime::now()
            .duration_since(last_poll)
            .unwrap_or_default();

        if elapsed.as_secs() < cached.interval {
            return;
        }
    }

    state.last_device_poll = Some(std::time::SystemTime::now());

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(_) => return,
    };

    let app_config = Arc::clone(&state.app_config);
    let device_code = cached.device_code.clone();

    let result = rt.block_on(async {
        let mut client = app_config.convex_client.clone();
        poll_device_code(&mut client, PollDeviceTokenArg { device_code }).await
    });

    match result {
        Ok(token_response) => {
            let expires_at_timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + token_response.expires_in;

            let new_session = session::Session::new(
                token_response.access_token,
                token_response.token_type,
                expires_at_timestamp,
            );

            if let Err(e) = session::save_session(new_session) {
                state.error_message = Some(format!("Failed to save session: {}", e));
            } else {
                device_cache::delete_device_code().ok();

                state.modal = Modal::None;
                state.last_device_poll = None;
                state.error_message = None;
            }
        }
        Err(e) => match DeviceAuthError::from_anyhow_error(&e) {
            Some(DeviceAuthError::AuthorizationPending) => {}
            Some(DeviceAuthError::AccessDenied) => {
                device_cache::delete_device_code().ok();
                state.error_message =
                    Some("Access denied. Authorization was rejected.".to_string());
                state.modal = Modal::None;
                state.last_device_poll = None;
            }
            Some(DeviceAuthError::ExpiredToken) => {
                device_cache::delete_device_code().ok();
                state.error_message = Some("Device code expired. Please try again.".to_string());
                state.modal = Modal::None;
                state.last_device_poll = None;
            }
            Some(DeviceAuthError::InvalidGrant) => {
                device_cache::delete_device_code().ok();
                state.error_message = Some("Invalid device code. Please try again.".to_string());
                state.modal = Modal::None;
                state.last_device_poll = None;
            }
            None => {}
        },
    }
}

fn cleanup_tui() {
    if TERMINAL.lock().unwrap().take().is_some() {
        disable_raw_mode().ok();
        execute!(io::stdout(), LeaveAlternateScreen).ok();
    }
}
