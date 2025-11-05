use std::{sync::Arc, time::SystemTime};

use super::screen::{OrganizationItem, ProjectListItem, Screen};
use crate::{helper::session, util::app_config::AppConfig};

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
    pub error_message: Option<String>,
    pub last_device_poll: Option<SystemTime>,
}

impl AppState {
    pub fn new(app_config: AppConfig) -> Self {
        Self {
            app_config: Arc::new(app_config),
            current_screen: Screen::Home,
            current_scope: Scope::Personal,
            available_scopes: vec![Scope::Personal],
            projects: Vec::new(),
            selected_project_index: 0,
            login_selected_index: 0,
            modal: Modal::None,
            should_quit: false,
            error_message: None,
            last_device_poll: None,
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
