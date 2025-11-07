use super::{
    components::{ELECTRIC_PURPLE, centered_rect},
    state::{AppState, Modal, Scope},
};
use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, ListState, Paragraph, Wrap},
};

pub fn render_modal(frame: &mut Frame, state: &AppState, area: Rect) {
    match &state.modal {
        Modal::None => {}
        Modal::ScopeSelector { selected_index } => {
            render_scope_selector(frame, state, *selected_index, area);
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
            render_create_project_modal(
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
            render_create_org_modal(frame, organization_name, *focused_field, area);
        }
        Modal::DeviceCodeAuth {
            user_code,
            redirect_url,
        } => {
            render_device_code_modal(frame, user_code, redirect_url, area);
        }
        Modal::MasterPasswordSetup {
            password,
            confirm_password,
            focused_field,
            show_password,
        } => {
            render_master_password_setup_modal(
                frame,
                password,
                confirm_password,
                *focused_field,
                *show_password,
                area,
            );
        }
    }
}

fn render_scope_selector(frame: &mut Frame, state: &AppState, selected_index: usize, area: Rect) {
    let modal_area = centered_rect(50, 40, area);

    frame.render_widget(Clear, modal_area);

    let items: Vec<ListItem> = state
        .available_scopes
        .iter()
        .map(|scope| {
            let line = Line::from(scope.display_name());
            ListItem::new(line)
        })
        .collect();

    let mut list_state = ListState::default();
    list_state.select(Some(selected_index));

    let list = List::new(items)
        .block(
            Block::default()
                .title("Select Scope")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(ELECTRIC_PURPLE)),
        )
        .highlight_style(Style::default().bg(ELECTRIC_PURPLE).fg(Color::White))
        .highlight_symbol("→ ");

    frame.render_stateful_widget(list, modal_area, &mut list_state);

    let help_area = Rect {
        x: modal_area.x + 1,
        y: modal_area.y + modal_area.height - 2,
        width: modal_area.width - 2,
        height: 1,
    };

    let help_text = Paragraph::new("↑/↓ or j/k: navigate | Enter: select | Esc: cancel")
        .style(Style::default().fg(Color::DarkGray));

    frame.render_widget(help_text, help_area);
}

fn render_create_project_modal(
    frame: &mut Frame,
    state: &AppState,
    name: &str,
    slug: &str,
    description: &str,
    selected_scope: &Scope,
    focused_field: usize,
    selecting_scope: bool,
    scope_selector_index: usize,
    area: Rect,
) {
    let modal_area = centered_rect(60, 60, area);

    frame.render_widget(Clear, modal_area);

    let block = Block::default()
        .title("Create Project")
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
            Constraint::Length(5),
            Constraint::Length(3),
            Constraint::Min(1),
            Constraint::Length(2),
        ])
        .split(inner_area);

    render_input_field(
        frame,
        chunks[0],
        "Name (required)",
        name,
        focused_field == 0,
    );
    render_input_field(
        frame,
        chunks[1],
        "Slug (required)",
        slug,
        focused_field == 1,
    );
    render_text_area_field(
        frame,
        chunks[2],
        "Description (optional)",
        description,
        focused_field == 2,
    );
    render_input_field(
        frame,
        chunks[3],
        "Scope",
        selected_scope.display_name(),
        focused_field == 3,
    );

    let help_text =
        Paragraph::new("Tab: next | Enter on Scope: select | Ctrl+S: create | Esc: cancel")
            .style(Style::default().fg(Color::DarkGray))
            .wrap(Wrap { trim: true });

    frame.render_widget(help_text, chunks[5]);

    // Render nested scope selector overlay when selecting_scope is true
    if selecting_scope {
        render_nested_scope_selector(frame, state, scope_selector_index, modal_area);
    }
}

fn render_create_org_modal(
    frame: &mut Frame,
    organization_name: &str,
    focused_field: usize,
    area: Rect,
) {
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

fn render_input_field(frame: &mut Frame, area: Rect, label: &str, value: &str, is_focused: bool) {
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

fn render_text_area_field(
    frame: &mut Frame,
    area: Rect,
    label: &str,
    value: &str,
    is_focused: bool,
) {
    let border_style = if is_focused {
        Style::default().fg(ELECTRIC_PURPLE)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let style = if is_focused {
        Style::default().fg(ELECTRIC_PURPLE)
    } else {
        Style::default().fg(Color::Gray)
    };

    let input_text = if is_focused {
        format!("{}_", value)
    } else {
        value.to_string()
    };

    let textarea = Paragraph::new(input_text)
        .block(
            Block::default()
                .title(label)
                .borders(Borders::ALL)
                .border_style(border_style),
        )
        .style(style)
        .wrap(Wrap { trim: false });

    frame.render_widget(textarea, area);
}

fn render_nested_scope_selector(
    frame: &mut Frame,
    state: &AppState,
    selected_index: usize,
    parent_area: Rect,
) {
    let selector_area = centered_rect(40, 30, parent_area);

    frame.render_widget(Clear, selector_area);

    let items: Vec<ListItem> = state
        .available_scopes
        .iter()
        .map(|scope| {
            let line = Line::from(scope.display_name());
            ListItem::new(line)
        })
        .collect();

    let mut list_state = ListState::default();
    list_state.select(Some(selected_index));

    let list = List::new(items)
        .block(
            Block::default()
                .title("Select Scope")
                .borders(Borders::ALL)
                .border_style(Style::default().fg(ELECTRIC_PURPLE)),
        )
        .highlight_style(Style::default().bg(ELECTRIC_PURPLE).fg(Color::White))
        .highlight_symbol("→ ");

    frame.render_stateful_widget(list, selector_area, &mut list_state);

    let help_area = Rect {
        x: selector_area.x + 1,
        y: selector_area.y + selector_area.height - 2,
        width: selector_area.width - 2,
        height: 1,
    };

    let help_text = Paragraph::new("↑/↓ or j/k: navigate | Enter: select | Esc: cancel")
        .style(Style::default().fg(Color::DarkGray));

    frame.render_widget(help_text, help_area);
}

fn render_device_code_modal(frame: &mut Frame, user_code: &str, redirect_url: &str, area: Rect) {
    let background = Block::default().style(Style::default().bg(Color::Black).fg(Color::DarkGray));
    frame.render_widget(background, area);

    let modal_area = centered_rect(60, 30, area);

    frame.render_widget(Clear, modal_area);

    let block = Block::default()
        .title("Device Authorization")
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
            Constraint::Length(3),
            Constraint::Length(1),
            Constraint::Min(1),
        ])
        .split(inner_area);

    let instruction = Paragraph::new("Verify this code matches in your browser:")
        .style(Style::default().fg(Color::Gray))
        .alignment(ratatui::layout::Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(instruction, chunks[0]);

    let code_display = Paragraph::new(user_code)
        .style(
            Style::default()
                .fg(ELECTRIC_PURPLE)
                .add_modifier(Modifier::BOLD),
        )
        .alignment(ratatui::layout::Alignment::Center);

    frame.render_widget(code_display, chunks[1]);

    let url_display = Paragraph::new(redirect_url)
        .style(Style::default().fg(Color::DarkGray))
        .alignment(ratatui::layout::Alignment::Center)
        .wrap(Wrap { trim: true });

    frame.render_widget(url_display, chunks[2]);

    let waiting_text = Paragraph::new("⏳ waiting...")
        .style(Style::default().fg(Color::DarkGray))
        .alignment(ratatui::layout::Alignment::Center);

    frame.render_widget(waiting_text, chunks[3]);
}

fn render_master_password_setup_modal(
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
