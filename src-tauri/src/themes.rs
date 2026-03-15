use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct ThemeSummary {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize)]
pub struct ThemeData {
    pub name: String,
    pub colors: HashMap<String, String>,
}

const BUNDLED_THEMES: &[(&str, &str)] = &[
    ("rosepine", r##"{
  "name": "Rosé Pine",
  "colors": {
    "background": "oklch(22.4% 0.012 277.7)",
    "foreground": "oklch(88.2% 0.01 277.7)",
    "card": "oklch(22.4% 0.012 277.7)",
    "card-foreground": "oklch(88.2% 0.01 277.7)",
    "popover": "oklch(22.4% 0.012 277.7)",
    "popover-foreground": "oklch(88.2% 0.01 277.7)",
    "primary": "oklch(72% 0.12 350)",
    "primary-foreground": "oklch(88.2% 0.01 277.7)",
    "secondary": "oklch(28% 0.014 277.7)",
    "secondary-foreground": "oklch(82% 0.01 277.7)",
    "muted": "oklch(28% 0.014 277.7)",
    "muted-foreground": "oklch(62% 0.01 277.7)",
    "accent": "oklch(32% 0.014 277.7)",
    "accent-foreground": "oklch(82% 0.01 277.7)",
    "destructive": "oklch(0.65 0.2 15)",
    "border": "oklch(18% 0.012 277.7)",
    "input": "oklch(32% 0.014 277.7)",
    "ring": "oklch(0.45 0 0)",
    "sidebar": "oklch(20% 0.012 277.7)",
    "sidebar-foreground": "oklch(72% 0.01 277.7)",
    "sidebar-primary": "oklch(72% 0.12 350)",
    "sidebar-primary-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(26% 0.012 277.7)",
    "sidebar-accent-foreground": "oklch(0.985 0 0)",
    "sidebar-border": "oklch(26% 0.012 277.7)",
    "sidebar-ring": "oklch(0.45 0 0)",
    "editor-text": "rgba(224, 222, 230, 0.96)",
    "editor-caret": "#c4a7e7",
    "editor-selection": "rgba(196, 167, 231, 0.15)"
  }
}"##),
    ("evergreen", r##"{
  "name": "Evergreen",
  "colors": {
    "background": "oklch(21% 0.015 155)",
    "foreground": "oklch(88% 0.01 155)",
    "card": "oklch(21% 0.015 155)",
    "card-foreground": "oklch(88% 0.01 155)",
    "popover": "oklch(21% 0.015 155)",
    "popover-foreground": "oklch(88% 0.01 155)",
    "primary": "oklch(70% 0.14 155)",
    "primary-foreground": "oklch(88% 0.01 155)",
    "secondary": "oklch(26% 0.015 155)",
    "secondary-foreground": "oklch(82% 0.01 155)",
    "muted": "oklch(26% 0.015 155)",
    "muted-foreground": "oklch(60% 0.01 155)",
    "accent": "oklch(30% 0.015 155)",
    "accent-foreground": "oklch(82% 0.01 155)",
    "destructive": "oklch(0.65 0.2 15)",
    "border": "oklch(16% 0.012 155)",
    "input": "oklch(30% 0.015 155)",
    "ring": "oklch(0.42 0 0)",
    "sidebar": "oklch(19% 0.015 155)",
    "sidebar-foreground": "oklch(70% 0.01 155)",
    "sidebar-primary": "oklch(70% 0.14 155)",
    "sidebar-primary-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(25% 0.012 155)",
    "sidebar-accent-foreground": "oklch(0.985 0 0)",
    "sidebar-border": "oklch(25% 0.012 155)",
    "sidebar-ring": "oklch(0.42 0 0)",
    "editor-text": "rgba(220, 235, 225, 0.96)",
    "editor-caret": "#7ec99d",
    "editor-selection": "rgba(126, 201, 157, 0.15)"
  }
}"##),
    ("amber", r##"{
  "name": "Amber",
  "colors": {
    "background": "oklch(22% 0.012 60)",
    "foreground": "oklch(88% 0.01 60)",
    "card": "oklch(22% 0.012 60)",
    "card-foreground": "oklch(88% 0.01 60)",
    "popover": "oklch(22% 0.012 60)",
    "popover-foreground": "oklch(88% 0.01 60)",
    "primary": "oklch(75% 0.14 70)",
    "primary-foreground": "oklch(22% 0.012 60)",
    "secondary": "oklch(27% 0.012 60)",
    "secondary-foreground": "oklch(82% 0.01 60)",
    "muted": "oklch(27% 0.012 60)",
    "muted-foreground": "oklch(62% 0.01 60)",
    "accent": "oklch(31% 0.012 60)",
    "accent-foreground": "oklch(82% 0.01 60)",
    "destructive": "oklch(0.65 0.2 15)",
    "border": "oklch(17% 0.01 60)",
    "input": "oklch(31% 0.012 60)",
    "ring": "oklch(0.44 0 0)",
    "sidebar": "oklch(20% 0.012 60)",
    "sidebar-foreground": "oklch(72% 0.01 60)",
    "sidebar-primary": "oklch(75% 0.14 70)",
    "sidebar-primary-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(26% 0.012 60)",
    "sidebar-accent-foreground": "oklch(0.985 0 0)",
    "sidebar-border": "oklch(26% 0.012 60)",
    "sidebar-ring": "oklch(0.44 0 0)",
    "editor-text": "rgba(235, 225, 210, 0.96)",
    "editor-caret": "#d4a54a",
    "editor-selection": "rgba(212, 165, 74, 0.15)"
  }
}"##),
    ("midnight", r##"{
  "name": "Midnight",
  "colors": {
    "background": "oklch(15% 0.005 265)",
    "foreground": "oklch(85% 0 0)",
    "card": "oklch(15% 0.005 265)",
    "card-foreground": "oklch(85% 0 0)",
    "popover": "oklch(15% 0.005 265)",
    "popover-foreground": "oklch(85% 0 0)",
    "primary": "oklch(64% 0.19 252)",
    "primary-foreground": "oklch(85% 0 0)",
    "secondary": "oklch(20% 0.008 265)",
    "secondary-foreground": "oklch(80% 0.005 265)",
    "muted": "oklch(20% 0.008 265)",
    "muted-foreground": "oklch(58% 0.005 265)",
    "accent": "oklch(24% 0.008 265)",
    "accent-foreground": "oklch(80% 0.005 265)",
    "destructive": "oklch(0.68 0.18 24)",
    "border": "oklch(11% 0.005 265)",
    "input": "oklch(24% 0.008 265)",
    "ring": "oklch(0.35 0 0)",
    "sidebar": "oklch(13% 0.005 265)",
    "sidebar-foreground": "oklch(65% 0.005 265)",
    "sidebar-primary": "oklch(64% 0.19 252)",
    "sidebar-primary-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(18% 0.005 265)",
    "sidebar-accent-foreground": "oklch(0.985 0 0)",
    "sidebar-border": "oklch(18% 0.005 265)",
    "sidebar-ring": "oklch(0.35 0 0)",
    "editor-text": "rgba(220, 225, 235, 0.96)",
    "editor-caret": "#6cb4ee",
    "editor-selection": "rgba(108, 180, 238, 0.15)"
  }
}"##),
];

fn themes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let dir = config_dir.join("themes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn seed_bundled_themes(dir: &PathBuf) {
    for (id, json) in BUNDLED_THEMES {
        let path = dir.join(format!("{}.json", id));
        if !path.exists() {
            let _ = fs::write(&path, json);
        }
    }
}

pub fn list_themes(app: &AppHandle) -> Result<Vec<ThemeSummary>, String> {
    let dir = themes_dir(app)?;
    seed_bundled_themes(&dir);

    let mut themes = vec![ThemeSummary {
        id: "default".to_string(),
        name: "Default".to_string(),
    }];

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };

        let contents = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let data: ThemeData = match serde_json::from_str(&contents) {
            Ok(d) => d,
            Err(_) => continue,
        };

        themes.push(ThemeSummary {
            id,
            name: data.name,
        });
    }

    Ok(themes)
}

pub fn read_theme(app: &AppHandle, theme_id: &str) -> Result<ThemeData, String> {
    let dir = themes_dir(app)?;
    let path = dir.join(format!("{}.json", theme_id));
    let contents = fs::read_to_string(&path)
        .map_err(|_| format!("Theme '{}' not found", theme_id))?;
    serde_json::from_str(&contents)
        .map_err(|e| format!("Invalid theme file: {}", e))
}

pub fn get_themes_path(app: &AppHandle) -> Result<String, String> {
    let dir = themes_dir(app)?;
    Ok(dir.to_string_lossy().into_owned())
}
