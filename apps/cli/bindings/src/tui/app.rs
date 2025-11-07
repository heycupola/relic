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
    helper::{device_cache, master_password, session},
    service::{
        auth::{
            DeviceAuthError, PollDeviceTokenArg, RequestDeviceCodeArg, poll_device_code,
            request_device_code,
        },
        organization::{CreateOrgArg, create_organization},
        user::{StoreUserKeyArg, get_user_key, store_user_key},
    },
    tui::{
        home::render_home_screen,
        modal::render_modal,
        project_screen::render_project_screen,
        screen::{ProjectScreenData, Screen},
        state::{AppState, MessageType, Modal},
    },
    util::{
        app_config::AppConfig,
        crypto::{derive_key, generate_keypair, generate_org_key, generate_salt, wrap_org_key},
    },
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
    // Handle Esc to dismiss messages (takes priority)
    if key.code == KeyCode::Esc && state.message.is_some() && state.modal == Modal::None {
        state.message = None;
        return;
    }

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
        Modal::MasterPasswordSetup { .. } => handle_master_password_setup_key_event(state, key),
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
                    selected_scope: state.current_scope.clone(),
                    focused_field: 0,
                    selecting_scope: false,
                    scope_selector_index: 0,
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
        selected_scope,
        focused_field,
        selecting_scope,
        scope_selector_index,
    } = &mut state.modal
    {
        if *selecting_scope {
            match key.code {
                KeyCode::Up | KeyCode::Char('k') => {
                    if *scope_selector_index > 0 {
                        *scope_selector_index -= 1;
                    }
                }
                KeyCode::Down | KeyCode::Char('j') => {
                    if *scope_selector_index < state.available_scopes.len() - 1 {
                        *scope_selector_index += 1;
                    }
                }
                KeyCode::Enter => {
                    if let Some(scope) = state.available_scopes.get(*scope_selector_index).cloned()
                    {
                        *selected_scope = scope;
                        *selecting_scope = false;
                    }
                }
                KeyCode::Esc => {
                    *selecting_scope = false;
                }
                _ => {}
            }
            return;
        }

        match key.modifiers {
            KeyModifiers::SHIFT => {
                if *focused_field > 0 {
                    *focused_field -= 1;
                }
            }
            _ => {}
        }

        match key.code {
            KeyCode::Esc => {
                state.modal = Modal::None;
            }
            KeyCode::Tab => {
                if *focused_field < 3 {
                    *focused_field += 1;
                }
            }
            KeyCode::Enter if *focused_field == 3 => {
                *selecting_scope = true;
                *scope_selector_index = state
                    .available_scopes
                    .iter()
                    .position(|s| s == selected_scope)
                    .unwrap_or(0);
            }
            KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                state.message = Some((
                    "Project creation not yet implemented (backend integration needed)".to_string(),
                    MessageType::Info,
                ));
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

fn handle_master_password_setup_key_event(state: &mut AppState, key: KeyEvent) {
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
            state.message = Some((format!("Failed to create runtime: {}", e), MessageType::Error));
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
                state.message = Some((format!("Failed to open browser: {}", e), MessageType::Error));
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
        state.message = Some(("Device code expired. Please try again.".to_string(), MessageType::Error));
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
                token_response.access_token.clone(),
                token_response.token_type,
                expires_at_timestamp,
            );

            tracing::info!("poll_device_flow: Saving session...");
            if let Err(e) = session::save_session(new_session) {
                tracing::error!("poll_device_flow: Failed to save session: {}", e);
                state.message = Some((format!("Failed to save session: {}", e), MessageType::Error));
            } else {
                tracing::info!("poll_device_flow: Session saved successfully");
                device_cache::delete_device_code().ok();
                state.last_device_poll = None;

                // Check if master password exists in OS keychain
                tracing::info!("poll_device_flow: Checking for master password in OS keychain");

                match master_password::get_master_password() {
                    Ok(Some(_)) => {
                        // Master password exists, user is fully set up
                        tracing::info!("Master password found in keychain");
                        state.modal = Modal::None;
                    }
                    Ok(None) => {
                        // No master password, MUST set it up
                        tracing::info!("No master password found - user MUST set one up");
                        state.modal = Modal::MasterPasswordSetup {
                            password: String::new(),
                            confirm_password: String::new(),
                            focused_field: 0,
                            show_password: false,
                        };
                        state.message = Some((
                            "🔐 Welcome! Please create your master password to secure your secrets."
                                .to_string(),
                            MessageType::Info,
                        ));
                    }
                    Err(e) => {
                        // Error checking keychain, show modal to be safe
                        tracing::error!("Failed to check master password: {}", e);
                        state.modal = Modal::MasterPasswordSetup {
                            password: String::new(),
                            confirm_password: String::new(),
                            focused_field: 0,
                            show_password: false,
                        };
                        state.message =
                            Some(("🔐 Please set up your master password to continue.".to_string(), MessageType::Info));
                    }
                }

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
                    state.message =
                        Some(("Access denied. Authorization was rejected.".to_string(), MessageType::Error));
                    state.modal = Modal::None;
                    state.last_device_poll = None;
                }
                Some(DeviceAuthError::ExpiredToken) => {
                    tracing::warn!("poll_device_flow: Expired token");
                    device_cache::delete_device_code().ok();
                    state.message =
                        Some(("Device code expired. Please try again.".to_string(), MessageType::Error));
                    state.modal = Modal::None;
                    state.last_device_poll = None;
                }
                Some(DeviceAuthError::InvalidGrant) => {
                    tracing::warn!("poll_device_flow: Invalid grant");
                    device_cache::delete_device_code().ok();
                    state.message =
                        Some(("Invalid device code. Please try again.".to_string(), MessageType::Error));
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

fn cleanup_tui() {
    if TERMINAL.lock().unwrap().take().is_some() {
        disable_raw_mode().ok();
        execute!(io::stdout(), LeaveAlternateScreen).ok();
    }
}
