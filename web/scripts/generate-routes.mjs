import { Generator, getConfig } from "@tanstack/router-generator";

async function main() {
  const root = process.cwd();
  const config = getConfig({}, root);
  await new Generator({ config, root }).run();
}

await main();
