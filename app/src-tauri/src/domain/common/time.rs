/// Current time as milliseconds since Unix epoch.
pub fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Current time as seconds since Unix epoch.
pub fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}
