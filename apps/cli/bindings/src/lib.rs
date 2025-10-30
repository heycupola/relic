pub mod util {
    pub mod app_config;
    pub mod crypto;
}

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

static mut TERMINAL: Option<Terminal<CrosstermBackend<io::Stdout>>> = None;
static mut APP_STATE: Option<Arc<Mutex<AppState>>> = None;
static mut THREAD_HANDLE: Option<thread::JoinHandle<()>> = None;

struct AppState {
    text: String,
    counter: i32,
    should_quit: bool,
}

#[unsafe(no_mangle)]
#[allow(static_mut_refs)]
pub extern "C" fn init_terminal() -> i32 {
    unsafe {
        enable_raw_mode().ok();
        let mut stdout = io::stdout();
        execute!(stdout, EnterAlternateScreen).ok();

        let backend = CrosstermBackend::new(stdout);
        TERMINAL = Terminal::new(backend).ok();

        APP_STATE = Some(Arc::new(Mutex::new(AppState {
            text: String::from("Press 'q' to quit"),
            counter: 0,
            should_quit: false,
        })));

        if TERMINAL.is_some() { 0 } else { -1 }
    }
}

#[unsafe(no_mangle)]
#[allow(static_mut_refs)]
pub extern "C" fn run_terminal_app() -> i32 {
    unsafe {
        if TERMINAL.is_none() || APP_STATE.is_none() {
            return -1;
        }

        let state = APP_STATE.as_ref().unwrap().clone();

        let handle = thread::spawn(move || {
            loop {
                {
                    let state_lock = state.lock().unwrap();
                    if state_lock.should_quit {
                        break;
                    }
                }

                if let Some(terminal) = TERMINAL.as_mut() {
                    let state_lock = state.lock().unwrap();
                    let text = format!("{}\n\nCounter: {}", state_lock.text, state_lock.counter);
                    drop(state_lock); // Release lock before drawing

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

                if event::poll(Duration::from_millis(100)).unwrap_or(false) {
                    if let Ok(Event::Key(key)) = event::read() {
                        let mut state_lock = state.lock().unwrap();
                        match key.code {
                            KeyCode::Char('q') => {
                                state_lock.should_quit = true;
                                break;
                            }
                            KeyCode::Char('u') => state_lock.counter += 1,
                            KeyCode::Char('d') => state_lock.counter -= 1,
                            _ => {}
                        }
                    }
                }

                thread::sleep(Duration::from_millis(16));
            }
        });

        THREAD_HANDLE = Some(handle);
        0
    }
}

#[unsafe(no_mangle)]
#[allow(static_mut_refs)]
pub extern "C" fn is_running() -> i32 {
    unsafe {
        if let Some(state) = APP_STATE.as_ref() {
            let state_lock = state.lock().unwrap();
            if state_lock.should_quit { 0 } else { 1 }
        } else {
            0
        }
    }
}

#[unsafe(no_mangle)]
#[allow(static_mut_refs)]
pub extern "C" fn stop_terminal_app() {
    unsafe {
        if let Some(state) = APP_STATE.as_ref() {
            let mut state_lock = state.lock().unwrap();
            state_lock.should_quit = true;
        }
    }
}

#[unsafe(no_mangle)]
#[allow(static_mut_refs)]
pub extern "C" fn cleanup_terminal() {
    unsafe {
        stop_terminal_app();

        if let Some(handle) = THREAD_HANDLE.take() {
            handle.join().ok();
        }

        if TERMINAL.take().is_some() {
            disable_raw_mode().ok();
            execute!(io::stdout(), LeaveAlternateScreen).ok();
        }

        APP_STATE = None;
    }
}
