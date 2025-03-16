import path from "path";

import type { Configuration } from "webpack";

import { plugins } from "./webpack.plugins";
import { rules } from "./webpack.rules";

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: "./src/main.ts",
  // Put your normal webpack config below here
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
    alias: {
      "~": path.resolve(__dirname, "src", "frontend"),
      "&": path.resolve(__dirname, "src", "backend"),
      $: path.resolve(__dirname, "src"),
    },
  },
  externals: {
    sqlite3: "commonjs2 sqlite3",
  },
};
