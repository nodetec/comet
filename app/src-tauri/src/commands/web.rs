use crate::error::AppError;

/// Resolve the title for a URL. Checks the macOS pasteboard for
/// `public.url-name` first, then fetches the page and extracts `<title>`.
#[tauri::command]
pub async fn resolve_url_title(url: String) -> Result<Option<String>, AppError> {
    // 1. Try the native pasteboard (instant)
    if let Some(title) = clipboard_url_name() {
        return Ok(Some(title));
    }

    // 2. Fetch the page and extract <title>
    let response = reqwest::Client::new()
        .get(&url)
        .header("Accept", "text/html")
        .header("User-Agent", "Mozilla/5.0 (compatible; Comet/1.0)")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| AppError::custom(format!("Failed to fetch page: {e}")))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::custom(format!("Failed to read response: {e}")))?;
    let html = String::from_utf8_lossy(&bytes[..bytes.len().min(16_384)]);

    Ok(extract_title(&html))
}

#[cfg(target_os = "macos")]
fn clipboard_url_name() -> Option<String> {
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::NSString;

    let pasteboard = NSPasteboard::generalPasteboard();
    let pb_type = NSString::from_str("public.url-name");
    let value = pasteboard.stringForType(&pb_type)?;
    let title = value.to_string();
    if title.is_empty() || title.starts_with("http") {
        None
    } else {
        Some(title)
    }
}

#[cfg(not(target_os = "macos"))]
fn clipboard_url_name() -> Option<String> {
    None
}

fn trim_title_suffix(title: &str) -> &str {
    let mut earliest: Option<usize> = None;
    for delim in [" | ", " - ", " — ", " · ", " :: ", " » "] {
        if let Some(pos) = title.find(delim) {
            earliest = Some(match earliest {
                Some(e) => e.min(pos),
                None => pos,
            });
        }
    }
    match earliest {
        Some(pos) if pos > 0 => title[..pos].trim(),
        _ => title,
    }
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let after_tag = html[start..].find('>')?;
    let content_start = start + after_tag + 1;
    let content_end = lower[content_start..].find("</title")?;
    let raw = &html[content_start..content_start + content_end];
    let decoded = html_escape::decode_html_entities(raw.trim()).into_owned();
    let title = trim_title_suffix(&decoded);
    if title.is_empty() {
        None
    } else {
        Some(title.to_owned())
    }
}
