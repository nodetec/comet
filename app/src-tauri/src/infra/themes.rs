use crate::error::AppError;
use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DARK_THEME_ID: &str = "dark";
const LIGHT_THEME_ID: &str = "light";
const DEFAULT_UI_FONT: &str = r#""Figtree Variable", sans-serif"#;
const THEME_COLOR_KEYS: &[&str] = &[
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "border",
    "input",
    "ring",
    "sidebar",
    "sidebar-foreground",
    "sidebar-accent-foreground",
    "sidebar-active-focus",
    "sidebar-muted",
    "sidebar-muted-foreground",
    "sidebar-item-icon",
    "sidebar-tag-icon",
    "sidebar-border",
    "separator",
    "editor-text",
    "editor-checkbox-border",
    "editor-caret",
    "editor-selection",
    "heading-color",
    "note-focus-indicator",
    "overlay-backdrop",
    "control-thumb",
    "search-match",
    "search-match-foreground",
    "markdown-highlight",
    "markdown-highlight-foreground",
    "warning",
    "warning-surface",
    "warning-border",
    "success",
    "success-foreground",
    "success-surface",
    "success-border",
    "syntax-atrule",
    "syntax-attribute",
    "syntax-keyword",
    "syntax-type",
    "syntax-comment",
    "syntax-string",
    "syntax-constant",
    "syntax-function",
    "syntax-number",
    "syntax-foreground",
    "syntax-regex",
    "syntax-selector",
];

static BUNDLED_THEMES_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../src/shared/theme/themes");

#[derive(Serialize)]
pub struct ThemeSummary {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeAppearance {
    Dark,
    Light,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThemeData {
    pub appearance: ThemeAppearance,
    pub name: String,
    #[serde(rename = "uiFont", default = "default_ui_font")]
    pub ui_font: String,
    pub colors: HashMap<String, String>,
}

fn default_ui_font() -> String {
    DEFAULT_UI_FONT.to_string()
}

fn themes_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let config_dir = app.path().app_config_dir()?;
    let dir = config_dir.join("themes");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn parse_theme(theme_id: &str, contents: &str) -> Result<ThemeData, AppError> {
    let data: ThemeData = serde_json::from_str(contents)
        .map_err(|e| AppError::custom(format!("Invalid theme file: {e}")))?;
    validate_theme_data(theme_id, &data)?;
    Ok(data)
}

fn validate_theme_data(theme_id: &str, data: &ThemeData) -> Result<(), AppError> {
    if data.ui_font.trim().is_empty() {
        return Err(AppError::custom(format!(
            "Theme '{theme_id}' does not match the theme schema (uiFont must not be empty)"
        )));
    }

    let actual_keys: Vec<&str> = data.colors.keys().map(String::as_str).collect();
    let missing_keys: Vec<&str> = THEME_COLOR_KEYS
        .iter()
        .copied()
        .filter(|key| !actual_keys.contains(key))
        .collect();
    let unknown_keys: Vec<&str> = actual_keys
        .into_iter()
        .filter(|key| !THEME_COLOR_KEYS.contains(key))
        .collect();

    if missing_keys.is_empty() && unknown_keys.is_empty() {
        return Ok(());
    }

    let mut problems = Vec::new();
    if !missing_keys.is_empty() {
        problems.push(format!("missing keys: {}", missing_keys.join(", ")));
    }
    if !unknown_keys.is_empty() {
        problems.push(format!("unknown keys: {}", unknown_keys.join(", ")));
    }

    Err(AppError::custom(format!(
        "Theme '{theme_id}' does not match the theme schema ({})",
        problems.join("; ")
    )))
}

fn remove_core_theme_overrides(dir: &PathBuf) -> Result<(), AppError> {
    for core_id in [DARK_THEME_ID, LIGHT_THEME_ID] {
        let path = dir.join(format!("{core_id}.json"));
        if path.exists() {
            fs::remove_file(path)?;
        }
    }

    Ok(())
}

pub fn list_themes(app: &AppHandle) -> Result<Vec<ThemeSummary>, AppError> {
    let dir = themes_dir(app)?;
    remove_core_theme_overrides(&dir)?;

    let mut themes = Vec::new();

    for file in BUNDLED_THEMES_DIR.files() {
        let Some(id) = file.path().file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        let Some(contents) = file.contents_utf8() else {
            continue;
        };

        let data = match parse_theme(id, contents) {
            Ok(data) => data,
            Err(_) => continue,
        };

        themes.push(ThemeSummary {
            id: id.to_string(),
            name: data.name,
        });
    }

    for entry in fs::read_dir(&dir)? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        };
        let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if matches!(id, DARK_THEME_ID | LIGHT_THEME_ID) {
            continue;
        }
        let contents = match fs::read_to_string(&path) {
            Ok(contents) => contents,
            Err(_) => continue,
        };

        let data = match parse_theme(id, &contents) {
            Ok(d) => d,
            Err(_) => continue,
        };

        themes.push(ThemeSummary {
            id: id.to_string(),
            name: data.name,
        });
    }

    themes.sort_by(|left, right| match (left.id.as_str(), right.id.as_str()) {
        (DARK_THEME_ID, LIGHT_THEME_ID) => std::cmp::Ordering::Less,
        (LIGHT_THEME_ID, DARK_THEME_ID) => std::cmp::Ordering::Greater,
        _ => left
            .name
            .cmp(&right.name)
            .then_with(|| left.id.cmp(&right.id)),
    });

    Ok(themes)
}

pub fn read_theme(app: &AppHandle, theme_id: &str) -> Result<ThemeData, AppError> {
    if let Some(file) = BUNDLED_THEMES_DIR
        .files()
        .find(|file| file.path().file_stem().and_then(|stem| stem.to_str()) == Some(theme_id))
    {
        let contents = file
            .contents_utf8()
            .ok_or_else(|| AppError::custom("Bundled theme file is not valid UTF-8"))?;
        return parse_theme(theme_id, contents);
    }

    let dir = themes_dir(app)?;
    let path = dir.join(format!("{theme_id}.json"));
    let contents = fs::read_to_string(&path)
        .map_err(|_| AppError::custom(format!("Theme '{theme_id}' not found")))?;
    parse_theme(theme_id, &contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_themes_match_schema() {
        for file in BUNDLED_THEMES_DIR.files() {
            let theme_id = file
                .path()
                .file_stem()
                .and_then(|stem| stem.to_str())
                .expect("bundled theme should have a valid file stem");
            let contents = file
                .contents_utf8()
                .expect("bundled theme should be valid UTF-8");
            let data: ThemeData =
                serde_json::from_str(contents).expect("bundled theme should parse");
            validate_theme_data(theme_id, &data)
                .expect("bundled theme should satisfy the shared theme schema");
        }
    }
}
