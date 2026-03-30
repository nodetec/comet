import { copySeedAttachments } from "./seed-attachments.mjs";

const sourceDir = process.argv[2];
const targetDir = process.argv[3];

if (!sourceDir || !targetDir) {
  console.error(
    "usage: node install-seed-attachments.mjs <source-dir> <target-dir>",
  );
  process.exit(1);
}

const copied = copySeedAttachments(sourceDir, targetDir);
console.log(`installed ${copied.length} attachments`);
