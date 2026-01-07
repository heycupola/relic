use std::panic;

use super::core::{SentryEvent, SentryReporter};

pub fn setup_panic_handler(reporter: SentryReporter) {
    let default_hook = panic::take_hook();

    panic::set_hook(Box::new(move |panic_info| {
        let message = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "Unknown panic".to_string());

        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());

        reporter.send_blocking(SentryEvent {
            message: format!("Panic: {}", message),
            source: "relic-cli".into(),
            level: "error".into(),
            context: Some(serde_json::json!({ "location": location })),
            tags: Some([("panic".into(), "true".into())].into()),
            user: None,
            breadcrumbs: vec![],
        });

        default_hook(panic_info);
    }));
}
