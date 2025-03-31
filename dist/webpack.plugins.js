"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugins = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
exports.plugins = [
    new ForkTsCheckerWebpackPlugin({
        logger: "webpack-infrastructure",
    }),
];
//# sourceMappingURL=webpack.plugins.js.map