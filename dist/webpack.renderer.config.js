"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rendererConfig = void 0;
const path_1 = __importDefault(require("path"));
const webpack_plugins_1 = require("./webpack.plugins");
const webpack_rules_1 = require("./webpack.rules");
// Filter out any existing CSS rules
const filteredRules = webpack_rules_1.rules.filter((rule) => !(rule &&
    typeof rule === "object" &&
    rule.test &&
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    String(rule.test).includes("\\.css")));
// Add our CSS rule
filteredRules.push({
    test: /\.css$/,
    use: [
        { loader: "style-loader" },
        { loader: "css-loader" },
        { loader: "postcss-loader" },
    ],
});
exports.rendererConfig = {
    module: {
        rules: filteredRules,
    },
    plugins: webpack_plugins_1.plugins,
    resolve: {
        extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
        alias: {
            "~": path_1.default.resolve(__dirname, "src", "frontend"),
            "&": path_1.default.resolve(__dirname, "src", "backend"),
            $: path_1.default.resolve(__dirname, "src"),
        },
    },
};
//# sourceMappingURL=webpack.renderer.config.js.map