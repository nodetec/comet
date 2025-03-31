"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mainConfig = void 0;
const path_1 = __importDefault(require("path"));
const webpack_plugins_1 = require("./webpack.plugins");
const webpack_rules_1 = require("./webpack.rules");
exports.mainConfig = {
    /**
     * This is the main entry point for your application, it's the first file
     * that runs in the main process.
     */
    entry: "./src/main.ts",
    // Put your normal webpack config below here
    module: {
        rules: webpack_rules_1.rules,
    },
    plugins: webpack_plugins_1.plugins,
    resolve: {
        extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
        alias: {
            "~": path_1.default.resolve(__dirname, "src", "frontend"),
            "&": path_1.default.resolve(__dirname, "src", "backend"),
            $: path_1.default.resolve(__dirname, "src"),
        },
    },
};
//# sourceMappingURL=webpack.main.config.js.map