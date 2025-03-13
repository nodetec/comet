import type { ModuleOptions } from "webpack";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const {
  defineReactCompilerLoaderOption,
  reactCompilerLoader,
// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("react-compiler-webpack");

export const rules: Required<ModuleOptions>["rules"] = [
  // Add support for native node modules
  {
    test: /\.[mc]?[jt]sx?$/i,
    exclude: /node_modules/,
    use: [
      // babel-loader, swc-loader, esbuild-loader, or anything you like to transpile JSX should go here.
      // If you are using rspack, the rspack's buiilt-in react transformation is sufficient.
      // { loader: 'swc-loader' },
      // Now add forgetti-loader
      {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        loader: reactCompilerLoader,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        options: defineReactCompilerLoaderOption({
          // React Compiler options goes here
        }),
      },
    ],
  },
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: "node-loader",
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: "@vercel/webpack-asset-relocator-loader",
      options: {
        outputAssetBase: "native_modules",
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: "ts-loader",
      options: {
        transpileOnly: true,
      },
    },
  },
];
