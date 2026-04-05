import { listSeedAttachments } from "./seed-attachments.mjs";

const attachmentsDir = process.argv[2];
const pubkey = process.argv[3];
const blossomUrl = process.argv[4];

if (!attachmentsDir || !pubkey || !blossomUrl) {
  console.error(
    "usage: node generate-seed-blob-meta.mjs <attachments-dir> <pubkey> <blossom-url>",
  );
  process.exit(1);
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const placeholderKey = "0".repeat(64);
const attachments = listSeedAttachments(attachmentsDir);

if (attachments.length === 0) {
  process.exit(0);
}

const values = attachments
  .map(
    (attachment) =>
      `  (${sqlText(attachment.hash)}, ${sqlText(blossomUrl)}, ${sqlText(pubkey)}, ${sqlText(attachment.hash)}, ${sqlText(placeholderKey)})`,
  )
  .join(",\n");

process.stdout.write(`INSERT INTO blob_meta (
  plaintext_hash,
  server_url,
  pubkey,
  ciphertext_hash,
  encryption_key
) VALUES
${values};
`);
