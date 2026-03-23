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

#[cfg(test)]
mod tests {
    use super::normalize_relay_url;

    #[test]
    fn valid_wss_url_passes_and_trailing_slash_stripped() {
        let result = normalize_relay_url("wss://relay.example.com/").unwrap();
        assert_eq!(result, "wss://relay.example.com");
    }

    #[test]
    fn valid_ws_url_passes() {
        let result = normalize_relay_url("ws://localhost:8080").unwrap();
        assert_eq!(result, "ws://localhost:8080");
    }

    #[test]
    fn invalid_scheme_returns_error() {
        let result = normalize_relay_url("https://relay.example.com");
        assert!(result.is_err());
    }

    #[test]
    fn non_url_string_returns_error() {
        let result = normalize_relay_url("not a url at all");
        assert!(result.is_err());
    }

    #[test]
    fn url_with_path_is_preserved() {
        let result = normalize_relay_url("wss://relay.example.com/path").unwrap();
        assert_eq!(result, "wss://relay.example.com/path");
    }
}
