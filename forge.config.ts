import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import dotenv from "dotenv";

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";

// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
dotenv.config({ path: "./.env" });

const config: ForgeConfig = {
  packagerConfig: {
    name: "Comet",
    icon: "./assets/icon",
    appBundleId: "org.nodetec.comet",
    executableName: "comet",
    asar: true,
    osxSign: {
      identity: process.env.APPLE_IDENTITY!,
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID!,
      appleIdPassword: process.env.APPLE_PASSWORD!,
      teamId: process.env.APPLE_TEAM_ID!,
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
    new MakerSquirrel({}),
    new MakerRpm({
      options: {
        name: "comet",
        productName: "Comet",
        icon: "./assets/icon.png",
        categories: ["Utility"],
        genericName: "Comet",
        bin: "comet",
        productDescription: "Comet - A note-taking application",
        homepage: "https://comet.md"
      }
    }),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      devContentSecurityPolicy: "",
      renderer: {
        config: rendererConfig,
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
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
