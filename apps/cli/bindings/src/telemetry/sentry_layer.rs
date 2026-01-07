use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::{layer::Context, Layer};

use super::core::{Breadcrumb, SentryEvent, SentryReporter};

#[allow(dead_code)]
const MAX_BREADCRUMBS: usize = 20;

pub struct SentryLayer {
    reporter: SentryReporter,
    breadcrumbs: Arc<Mutex<VecDeque<Breadcrumb>>>,
    source: String,
}

#[allow(dead_code)]
impl SentryLayer {
    pub fn new(reporter: SentryReporter, source: impl Into<String>) -> Self {
        Self {
            reporter,
            breadcrumbs: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_BREADCRUMBS))),
            source: source.into(),
        }
    }

    fn add_breadcrumb(&self, message: String) {
        if let Ok(mut crumbs) = self.breadcrumbs.lock() {
            if crumbs.len() >= MAX_BREADCRUMBS {
                crumbs.pop_front();
            }
            crumbs.push_back(Breadcrumb::new(message));
        }
    }

    fn get_breadcrumbs(&self) -> Vec<Breadcrumb> {
        self.breadcrumbs
            .lock()
            .map(|crumbs| crumbs.iter().cloned().collect())
            .unwrap_or_default()
    }
}

impl<S: Subscriber> Layer<S> for SentryLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let level = event.metadata().level();
        let message = format_event(event);

        match *level {
            Level::ERROR | Level::WARN => {
                let breadcrumbs = self.get_breadcrumbs();
                self.reporter.send(SentryEvent {
                    message,
                    source: self.source.clone(),
                    level: level.as_str().to_lowercase(),
                    context: None,
                    tags: None,
                    user: None,
                    breadcrumbs,
                });
            }
            _ => self.add_breadcrumb(message),
        }
    }
}

fn format_event(event: &Event<'_>) -> String {
    let mut visitor = MessageVisitor::default();
    event.record(&mut visitor);
    visitor.message.unwrap_or_else(|| event.metadata().name().to_string())
}

#[derive(Default)]
struct MessageVisitor {
    message: Option<String>,
}

impl tracing::field::Visit for MessageVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.message = Some(format!("{:?}", value));
        } else if self.message.is_none() {
            self.message = Some(format!("{}: {:?}", field.name(), value));
        }
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            self.message = Some(value.to_string());
        }
    }
}
