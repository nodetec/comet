import type { NostrEvent } from "./client";

export const COMET_NOTE_SNAPSHOT_KIND = 42061;
export const COMET_NOTE_COLLECTION = "notes";
const COMET_NOTE_SNAPSHOT_VERSION = 1;

export interface BlobRef {
  plaintextHash: string;
  ciphertextHash: string;
  encryptionKey: string;
}

export interface Note {
  id: string;
  title: string;
  markdown: string;
  createdAt: number;
  modifiedAt: number;
  editedAt: number;
  archivedAt?: number;
  deletedAt?: number;
  pinnedAt?: number;
  tags: string[];
  blobs: BlobRef[];
}

type NoteSnapshotAttachment = {
  plaintext_hash: string;
  ciphertext_hash: string;
  key: string;
};

type NoteSnapshotPayload = {
  version: number;
  device_id: string;
  markdown: string;
  note_created_at: number;
  edited_at: number;
  deleted_at?: number;
  archived_at?: number;
  pinned_at?: number;
  readonly?: boolean;
  tags: string[];
  attachments: NoteSnapshotAttachment[];
};

function getSingleTag(tags: string[][], name: string): string | null {
  const tag = tags.find(([tagName]) => tagName === name);
  return tag?.[1] ?? null;
}

function titleFromMarkdown(markdown: string): string {
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (!line.startsWith("# ")) {
      continue;
    }

    return line.slice(2).trim();
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSnapshotAttachment(value: unknown): value is NoteSnapshotAttachment {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.plaintext_hash === "string" &&
    typeof value.ciphertext_hash === "string" &&
    typeof value.key === "string"
  );
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === "number";
}

function isNoteSnapshotPayload(value: unknown): value is NoteSnapshotPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === COMET_NOTE_SNAPSHOT_VERSION &&
    typeof value.device_id === "string" &&
    typeof value.markdown === "string" &&
    typeof value.note_created_at === "number" &&
    typeof value.edited_at === "number" &&
    isOptionalNumber(value.deleted_at) &&
    isOptionalNumber(value.archived_at) &&
    isOptionalNumber(value.pinned_at) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(value.attachments) &&
    value.attachments.every(isSnapshotAttachment)
  );
}

async function decryptNoteSnapshotPayload(
  event: NostrEvent,
): Promise<NoteSnapshotPayload> {
  if (!window.nostr?.nip44) {
    throw new Error("NIP-07 extension with NIP-44 support required");
  }

  const payloadJson = await window.nostr.nip44.decrypt(
    event.pubkey,
    event.content,
  );
  const payload = JSON.parse(payloadJson) as unknown;

  if (!isNoteSnapshotPayload(payload)) {
    throw new Error("Invalid Comet note snapshot payload");
  }

  return payload;
}

export async function parseNoteSnapshotEvent(
  event: NostrEvent,
): Promise<Note | null> {
  if (event.kind !== COMET_NOTE_SNAPSHOT_KIND) {
    return null;
  }

  const noteId = getSingleTag(event.tags, "d");
  const operation = getSingleTag(event.tags, "o");
  const collection = getSingleTag(event.tags, "c");
  if (!noteId) {
    throw new Error("Missing d tag in Comet note snapshot");
  }
  if (operation !== "put" && operation !== "del") {
    throw new Error(`Invalid snapshot operation: ${operation ?? "missing"}`);
  }
  if (collection !== COMET_NOTE_COLLECTION) {
    throw new Error(`Invalid snapshot collection: ${collection ?? "missing"}`);
  }

  const payload = await decryptNoteSnapshotPayload(event);
  if (operation === "del" && payload.deleted_at == null) {
    throw new Error("Delete note snapshot payload is missing deleted_at");
  }

  return {
    id: noteId,
    title: titleFromMarkdown(payload.markdown),
    markdown: payload.markdown,
    createdAt: payload.note_created_at,
    modifiedAt: event.created_at * 1000,
    editedAt: payload.edited_at,
    archivedAt: payload.archived_at,
    deletedAt: payload.deleted_at,
    pinnedAt: payload.pinned_at,
    tags: payload.tags,
    blobs: payload.attachments.map((attachment) => ({
      plaintextHash: attachment.plaintext_hash,
      ciphertextHash: attachment.ciphertext_hash,
      encryptionKey: attachment.key,
    })),
  };
}
