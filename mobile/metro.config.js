const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

// Resolve packages that pnpm isolates but Metro can't find through symlinks
function resolveModule(name) {
  return path.dirname(require.resolve(`${name}/package.json`));
}

const config = {
  projectRoot,
  watchFolders: [monorepoRoot],
  resolver: {
    unstable_enableSymlinks: true,
    unstable_enablePackageExports: true,
    nodeModulesPaths: [
      path.resolve(projectRoot, "node_modules"),
      path.resolve(monorepoRoot, "node_modules"),
    ],
    // Map packages that pnpm isolates away from their consumers
    extraNodeModules: {
      "html-entities": resolveModule("html-entities"),
      "expensify-common": resolveModule("expensify-common"),
    },
    // Prevent Metro from crawling into other workspace packages
    blockList: [
      /app\/node_modules\/.*/,
      /relay\/node_modules\/.*/,
      /blossom\/node_modules\/.*/,
      /web\/node_modules\/.*/,
      /www\/node_modules\/.*/,
      /mcp\/node_modules\/.*/,
      /docs\/node_modules\/.*/,
      /packages\/.*\/node_modules\/.*/,
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
