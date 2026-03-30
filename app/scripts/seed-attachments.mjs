import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

function normalizeExtension(extension) {
  return extension.toLowerCase();
}

function isAttachmentFile(fileName) {
  if (fileName === "manifest.json") {
    return false;
  }

  const extension = path.extname(fileName).slice(1).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension);
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function listSeedAttachments(attachmentsDir) {
  if (!fs.existsSync(attachmentsDir)) {
    return [];
  }

  return fs
    .readdirSync(attachmentsDir)
    .filter(isAttachmentFile)
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => {
      const sourcePath = path.join(attachmentsDir, fileName);
      const bytes = fs.readFileSync(sourcePath);
      const ext = normalizeExtension(path.extname(fileName).slice(1));
      const hash = sha256Hex(bytes);
      const noteSlug = fileName.replace(/\.[^.]+$/u, "");

      return {
        noteSlug,
        fileName,
        sourcePath,
        ext,
        hash,
        targetFileName: `${hash}.${ext}`,
        uri: `attachment://${hash}.${ext}`,
        bytes,
      };
    });
}

export function attachmentsByNoteSlug(attachmentsDir) {
  return new Map(
    listSeedAttachments(attachmentsDir).map((attachment) => [
      attachment.noteSlug,
      attachment,
    ]),
  );
}

export function copySeedAttachments(attachmentsDir, targetDir) {
  const attachments = listSeedAttachments(attachmentsDir);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const attachment of attachments) {
    fs.writeFileSync(
      path.join(targetDir, attachment.targetFileName),
      attachment.bytes,
    );
  }

  return attachments.map((attachment) => ({
    noteSlug: attachment.noteSlug,
    targetFileName: attachment.targetFileName,
    uri: attachment.uri,
  }));
}
