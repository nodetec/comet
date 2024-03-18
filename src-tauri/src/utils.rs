use chrono::{DateTime, Utc};
use rusqlite::Error as RusqliteError;

pub fn parse_datetime(s: &str) -> Result<DateTime<Utc>, RusqliteError> {
    DateTime::parse_from_rfc3339(s)
        .map_err(|_| RusqliteError::InvalidQuery)
        .map(|dt| dt.with_timezone(&Utc))
}
