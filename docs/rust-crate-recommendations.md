# Rust Crate Recommendations

Analysis of the Rust backend to identify crates that could simplify or improve the code.

## High-Impact

### `thiserror`

The biggest win. There are ~230 `.map_err(|e| e.to_string())?` calls across the codebase. With `thiserror`, a single `AppError` enum auto-converts from `rusqlite::Error`, `std::io::Error`, `serde_json::Error`, etc., and implements `Into<tauri::InvokeError>`. Most of those `.map_err()` calls become plain `?`.

```rust
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Custom(String),
}
impl serde::Serialize for AppError { ... } // required by Tauri
```

### `url`

Manual URL validation exists in at least 2 places (relay URLs in `nostr.rs`, blossom URLs in `lib.rs`) doing `starts_with("https://")` / `trim_end_matches('/')`. The `url` crate handles parsing, normalization, and scheme validation properly.

### `chrono` (or `time`)

11 instances of `SystemTime::now().duration_since(UNIX_EPOCH).map_err(...)?.as_millis() as i64`. `chrono::Utc::now().timestamp_millis()` is a one-liner with no error handling needed. Alternatively, a simple `fn now_millis() -> i64` helper would consolidate this without a new dependency.

## Medium-Impact

### `once_cell` (or `std::sync::LazyLock` on Rust 1.80+)

Useful for compiled regex patterns or other static initialization that gets repeated.

### `itertools`

Minor but nice for `.collect()` chains or grouping operations in `notes.rs`.

## Not Recommended

### `sqlx` over `rusqlite`

High-effort migration, and rusqlite works fine with Tauri's sync command model. The boilerplate reduction from `thiserror` alone handles most of the pain.

### `anyhow`

Better suited for CLIs/scripts. Since we want typed errors for the Tauri IPC boundary, `thiserror` is the right choice.

### `sea-orm` / `diesel`

Overkill for the query patterns in this project.

## Current Pain Points by Count

| Pattern | Count | Files |
|---------|-------|-------|
| `.map_err()` chains | ~230 | All |
| `.to_string()` error conversions | ~292 | All |
| `query_row` + `.map_err()` | ~36 | notes.rs, lib.rs, nostr.rs |
| `SystemTime::now()...` boilerplate | 11 | 4 files |
| Manual URL validation | 2 | lib.rs, nostr.rs |
