use crate::error::AppError;

pub fn normalize_relay_url(raw: &str) -> Result<String, AppError> {
    let parsed = url::Url::parse(raw.trim()).map_err(|_| AppError::custom("Invalid relay URL"))?;
    match parsed.scheme() {
        "wss" | "ws" => {}
        _ => {
            return Err(AppError::custom(
                "Relay URL must start with wss:// or ws://",
            ))
        }
    }
    Ok(parsed.as_str().trim_end_matches('/').to_string())
}
