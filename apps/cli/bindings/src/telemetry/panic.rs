use super::core::{SentryReport, SentryReporter};
use std::panic;

pub fn setup_panic_handler(sentry: SentryReporter) {
    let default_hook = panic::take_hook();

    panic::set_hook(Box::new(move |panic_info| {
        let msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };

        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());

        let sentry_clone = sentry.clone();
        std::thread::spawn(move || {
            if let Ok(rt) = tokio::runtime::Runtime::new() {
                let _ = rt.block_on(async {
                    sentry_clone
                        .report_sync(
                            SentryReport::error("relic-cli", format!("Panic: {}", msg))
                                .with_context(serde_json::json!({
                                    "location": location,
                                    "thread": format!("{:?}", std::thread::current().id())
                                }))
                                .with_tag("panic", "true")
                                .with_fingerprint(vec!["panic".to_string(), location.clone()]),
                        )
                        .await
                });
            }
        });

        std::thread::sleep(std::time::Duration::from_millis(500));
        default_hook(panic_info);
    }));
}
