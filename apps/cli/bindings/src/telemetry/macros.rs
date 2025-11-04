#[macro_export]
macro_rules! sentry_error {
    ($reporter:expr, $source:expr, $msg:expr) => {
        $reporter.report($crate::telemetry::SentryReport::error($source, $msg));
    };
    ($reporter:expr, $source:expr, $msg:expr, $context:expr) => {
        $reporter.report(
            $crate::telemetry::SentryReport::error($source, $msg)
                .with_context(serde_json::json!($context)),
        );
    };
}

#[macro_export]
macro_rules! sentry_warning {
    ($reporter:expr, $source:expr, $msg:expr) => {
        $reporter.report($crate::telemetry::SentryReport::warning($source, $msg));
    };
    ($reporter:expr, $source:expr, $msg:expr, $context:expr) => {
        $reporter.report(
            $crate::telemetry::SentryReport::warning($source, $msg)
                .with_context(serde_json::json!($context)),
        );
    };
}

#[macro_export]
macro_rules! sentry_info {
    ($reporter:expr, $source:expr, $msg:expr) => {
        $reporter.report($crate::telemetry::SentryReport::info($source, $msg));
    };
    ($reporter:expr, $source:expr, $msg:expr, $context:expr) => {
        $reporter.report(
            $crate::telemetry::SentryReport::info($source, $msg)
                .with_context(serde_json::json!($context)),
        );
    };
}
