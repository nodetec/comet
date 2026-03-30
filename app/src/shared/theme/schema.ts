import type { ThemeData } from "@/shared/api/types";

import darkThemeJson from "./themes/dark.json";

export const SYSTEM_THEME_ID = "system";
export const DARK_THEME_ID = "dark";
export const LIGHT_THEME_ID = "light";

export const THEME_COLOR_KEYS = [
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
  "sidebar-primary",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-active-focus",
  "sidebar-muted",
  "sidebar-muted-foreground",
  "sidebar-item-icon",
  "sidebar-tag-icon",
  "sidebar-border",
  "separator",
  "editor-text",
  "editor-caret",
  "editor-selection",
  "heading-color",
  "blockquote-accent",
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
  "syntax-link",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

export const DARK_THEME = darkThemeJson as ThemeData;
