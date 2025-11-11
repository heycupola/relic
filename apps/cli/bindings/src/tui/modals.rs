mod create_organization;
mod create_project;
mod device_code_auth;
mod master_password;
mod pro_plan_upgrade;
mod scope_selector;

use crossterm::event::KeyEvent;
use ratatui::{Frame, layout::Rect};

use crate::tui::state::{AppState, Modal};

/// Central modal renderer - delegates to specific modal modules
pub fn render_modal(frame: &mut Frame, state: &AppState, area: Rect) {
    match &state.modal {
        Modal::None => {}
        Modal::ScopeSelector { selected_index } => {
            scope_selector::render(frame, state, *selected_index, area);
        }
        Modal::CreateProject {
            name,
            slug,
            description,
            selected_scope,
            focused_field,
            selecting_scope,
            scope_selector_index,
        } => {
            create_project::render(
                frame,
                state,
                name,
                slug,
                description,
                selected_scope,
                *focused_field,
                *selecting_scope,
                *scope_selector_index,
                area,
            );
        }
        Modal::CreateOrganization {
            organization_name,
            focused_field,
        } => {
            create_organization::render(frame, organization_name, *focused_field, area);
        }
        Modal::DeviceCodeAuth {
            user_code,
            redirect_url,
        } => {
            device_code_auth::render(frame, user_code, redirect_url, area);
        }
        Modal::MasterPasswordSetup {
            password,
            confirm_password,
            focused_field,
            show_password,
        } => {
            master_password::render(
                frame,
                password,
                confirm_password,
                *focused_field,
                *show_password,
                area,
            );
        }
        Modal::ProPlanUpgrade => {
            pro_plan_upgrade::render(frame, area);
        }
    }
}

/// Central key handler - delegates to specific modal modules
pub fn handle_modal_key_event(state: &mut AppState, key: KeyEvent) {
    match &state.modal {
        Modal::None => {}
        Modal::ScopeSelector { .. } => scope_selector::handle_key_event(state, key),
        Modal::CreateProject { .. } => create_project::handle_key_event(state, key),
        Modal::CreateOrganization { .. } => create_organization::handle_key_event(state, key),
        Modal::DeviceCodeAuth { .. } => device_code_auth::handle_key_event(state, key),
        Modal::MasterPasswordSetup { .. } => master_password::handle_key_event(state, key),
        Modal::ProPlanUpgrade => pro_plan_upgrade::handle_key_event(state, key),
    }
}
