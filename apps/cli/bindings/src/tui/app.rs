use std::{
    io,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{
    Terminal,
    prelude::CrosstermBackend,
    widgets::{Block, Borders, Paragraph},
};

use crate::util::app_config::AppConfig;

static TERMINAL: Mutex<Option<Terminal<CrosstermBackend<io::Stdout>>>> = Mutex::new(None);

struct AppState {
    text: String,
    counter: i32,
}

pub fn start_tui(_app_config: AppConfig) {
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

    let state = Arc::new(Mutex::new(AppState {
        text: String::from("Press 'q' to quit"),
        counter: 0,
    }));

    ctrlc::set_handler(|| {
        *TERMINAL.lock().unwrap() = None;
    })
    .expect("Error setting Ctrl-C handler");

    let handle = thread::spawn(move || {
        loop {
            if TERMINAL.lock().unwrap().is_none() {
                break;
            }

            if let Some(terminal) = TERMINAL.lock().unwrap().as_mut() {
                let state_lock = state.lock().unwrap();
                let text = format!("{}\n\nCounter: {}", state_lock.text, state_lock.counter);
                drop(state_lock);

                terminal
                    .draw(|f| {
                        let paragraph = Paragraph::new(text).block(
                            Block::default()
                                .borders(Borders::ALL)
                                .title("Ratatui + Bun (Threaded)"),
                        );
                        f.render_widget(paragraph, f.area());
                    })
                    .ok();
            }

            if event::poll(Duration::from_millis(100)).unwrap_or(false)
                && let Ok(Event::Key(key)) = event::read()
            {
                let mut state_lock = state.lock().unwrap();
                match key.code {
                    KeyCode::Char('q') => {
                        break;
                    }
                    KeyCode::Char('u') => state_lock.counter += 1,
                    KeyCode::Char('d') => state_lock.counter -= 1,
                    _ => {}
                }
            }

            thread::sleep(Duration::from_millis(16));
        }
    });

    handle.join().ok();
    cleanup_tui();
}

fn cleanup_tui() {
    if TERMINAL.lock().unwrap().take().is_some() {
        disable_raw_mode().ok();
        execute!(io::stdout(), LeaveAlternateScreen).ok();
    }
}
