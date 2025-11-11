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

#[macro_export]
macro_rules! trace_dbg {
    (target: $target:expr, level: $level:expr, $ex:expr) => {{
        match $ex {
            value => {
                tracing::event!(target: $target, $level, ?value, stringify!($ex));
                value
            }
        }
    }};
    (level: $level:expr, $ex:expr) => {
        trace_dbg!(target: module_path!(), level: $level, $ex)
    };
    (target: $target:expr, $ex:expr) => {
        trace_dbg!(target: $target, level: tracing::Level::DEBUG, $ex)
    };
    ($ex:expr) => {
        trace_dbg!(level: tracing::Level::DEBUG, $ex)
    };
}

#[macro_export]
macro_rules! fn_name {
    () => {{
        fn f() {}
        fn type_name_of<T>(_: T) -> &'static str {
            std::any::type_name::<T>()
        }
        let name = type_name_of(f);
        &name[..name.len() - 3]
    }};
}
