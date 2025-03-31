"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const maker_deb_1 = require("@electron-forge/maker-deb");
const maker_rpm_1 = require("@electron-forge/maker-rpm");
const maker_squirrel_1 = require("@electron-forge/maker-squirrel");
const plugin_auto_unpack_natives_1 = require("@electron-forge/plugin-auto-unpack-natives");
const plugin_fuses_1 = require("@electron-forge/plugin-fuses");
const plugin_webpack_1 = require("@electron-forge/plugin-webpack");
const fuses_1 = require("@electron/fuses");
const dotenv_1 = __importDefault(require("dotenv"));
const webpack_main_config_1 = require("./webpack.main.config");
const webpack_renderer_config_1 = require("./webpack.renderer.config");
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
dotenv_1.default.config({ path: "./.env" });
const config = {
    packagerConfig: {
        name: "Comet",
        icon: "./assets/icon",
        appBundleId: "org.nodetec.comet",
        executableName: "comet",
        asar: true,
        osxSign: {
            identity: process.env.APPLE_IDENTITY,
        },
        osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
        },
    },
    rebuildConfig: {},
    makers: [
        {
            name: "@electron-forge/maker-dmg",
            config: {
                name: "Comet",
                icon: "./assets/icon.icns",
                overwrite: true,
                format: "ULFO",
            },
        },
        {
            name: "@reforged/maker-appimage",
            config: {
                options: {
                    categories: ["Publishing"],
                    icon: "./assets/icon.png",
                    bin: "comet",
                    genericName: "Comet",
                    name: "Comet",
                    productName: "Comet",
                },
            },
        },
        new maker_squirrel_1.MakerSquirrel({}),
        new maker_rpm_1.MakerRpm({
            options: {
                name: "comet",
                productName: "Comet",
                icon: "./assets/icon.png",
                categories: ["Utility"],
                genericName: "Comet",
                bin: "comet",
                productDescription: "Comet - A note-taking application",
                homepage: "https://comet.md",
            },
        }),
        new maker_deb_1.MakerDeb({
            options: {
                name: "comet",
                productName: "Comet",
                icon: "./assets/icon.png",
                categories: ["Utility"],
                genericName: "Comet",
                bin: "comet",
                productDescription: "Comet - A note-taking application",
                homepage: "https://comet.md",
            },
        }),
    ],
    plugins: [
        new plugin_auto_unpack_natives_1.AutoUnpackNativesPlugin({}),
        new plugin_webpack_1.WebpackPlugin({
            mainConfig: webpack_main_config_1.mainConfig,
            devContentSecurityPolicy: "",
            renderer: {
                config: webpack_renderer_config_1.rendererConfig,
                entryPoints: [
                    {
                        html: "./src/frontend/index.html",
                        js: "./src/renderer.ts",
                        name: "main_window",
                        preload: {
                            js: "./src/preload.ts",
                        },
                    },
                ],
            },
        }),
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new plugin_fuses_1.FusesPlugin({
            version: fuses_1.FuseVersion.V1,
            [fuses_1.FuseV1Options.RunAsNode]: false,
            [fuses_1.FuseV1Options.EnableCookieEncryption]: true,
            [fuses_1.FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [fuses_1.FuseV1Options.EnableNodeCliInspectArguments]: false,
            [fuses_1.FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [fuses_1.FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};
exports.default = config;
//# sourceMappingURL=forge.config.js.map