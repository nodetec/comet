import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const darkThemePath = path.resolve(
  scriptDir,
  "../src/shared/theme/themes/dark.json",
);
const lightThemePath = path.resolve(
  scriptDir,
  "../src/shared/theme/themes/light.json",
);
const outputPath = path.resolve(
  scriptDir,
  "../src/shared/theme/system-theme.css",
);

const darkTheme = JSON.parse(await fs.readFile(darkThemePath, "utf8"));
const lightTheme = JSON.parse(await fs.readFile(lightThemePath, "utf8"));

function themeBlock(theme) {
  return [
    `  color-scheme: ${theme.appearance};`,
    ...Object.entries(theme.colors).map(
      ([key, value]) => `  --${key}: ${value};`,
    ),
  ];
}

const css = [
  "/* Generated from src/shared/theme/themes/dark.json and light.json. */",
  ":root {",
  ...themeBlock(darkTheme),
  "}",
  "",
  "@media (prefers-color-scheme: light) {",
  "  :root {",
  ...themeBlock(lightTheme).map((line) => `  ${line}`),
  "  }",
  "}",
  "",
].join("\n");

await fs.writeFile(outputPath, css);
