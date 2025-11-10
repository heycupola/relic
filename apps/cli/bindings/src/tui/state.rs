use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::SystemTime,
};

use super::screens::{OrganizationItem, ProjectListItem, Screen};
use crate::{
    helper::{master_password::MPGuard, session},
    util::app_config::AppConfig,
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Scope {
    Personal,
    Organization(OrganizationItem),
}

impl Scope {
    pub fn display_name(&self) -> &str {
        match self {
            Scope::Personal => "Personal",
            Scope::Organization(org) => &org.name,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LoginOption {
    Google,
    GitHub,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MessageType {
    Success,
    Error,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Modal {
    None,
    ScopeSelector {
        selected_index: usize,
    },
    CreateProject {
        name: String,
        slug: String,
        description: String,
        selected_scope: Scope,
        focused_field: usize,
        selecting_scope: bool,
        scope_selector_index: usize,
    },
    CreateOrganization {
        organization_name: String,
        focused_field: usize,
    },
    DeviceCodeAuth {
        user_code: String,
        redirect_url: String,
    },
    MasterPasswordSetup {
        password: String,
        confirm_password: String,
        focused_field: usize,
        show_password: bool,
    },
}

pub struct AppState {
    pub app_config: Arc<AppConfig>,
    pub current_screen: Screen,
    pub current_scope: Scope,
    pub available_scopes: Vec<Scope>,
    pub projects: Vec<ProjectListItem>,
    pub selected_project_index: usize,
    pub login_selected_index: usize,
    pub modal: Modal,
    pub should_quit: bool,
    pub message: Option<(String, MessageType)>,
    pub last_device_poll: Option<SystemTime>,
    pub mp_guard: MPGuard,
    pub background_messages: Arc<Mutex<VecDeque<(String, MessageType)>>>,
    pub background_task_running: Arc<Mutex<bool>>,
}

impl AppState {
    pub fn new(app_config: AppConfig) -> Self {
        // Check if user is already logged in to determine initial screen
        let is_logged_in = if let Ok(session) = session::load_session() {
            match session {
                Some(s) => !s.is_expired(),
                None => false,
            }
        } else {
            false
        };

        let initial_screen = if is_logged_in {
            Screen::Home
        } else {
            Screen::Login
        };

        Self {
            app_config: Arc::new(app_config),
            current_screen: initial_screen,
            current_scope: Scope::Personal,
            available_scopes: vec![Scope::Personal],
            projects: Vec::new(),
            selected_project_index: 0,
            login_selected_index: 0,
            modal: Modal::None,
            should_quit: false,
            message: None,
            last_device_poll: None,
            mp_guard: MPGuard::new().expect("Unable to instantiate MPGuard"),
            background_messages: Arc::new(Mutex::new(VecDeque::new())),
            background_task_running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn is_logged_in(&self) -> bool {
        if let Ok(session) = session::load_session() {
            match session {
                Some(s) => {
                    if s.is_expired() {
                        return false;
                    }

                    return true;
                }
                None => return false,
            }
        } else {
            return false;
        }
    }

    pub fn get_login_options() -> Vec<LoginOption> {
        vec![LoginOption::Google, LoginOption::GitHub]
    }
}
