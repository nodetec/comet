import type { Rumor } from "./nip59";

export interface BlobRef {
  plaintextHash: string;
  ciphertextHash: string;
  encryptionKey: string;
}

export interface Note {
  id: string;
  title: string;
  markdown: string;
  notebookId?: string;
  createdAt: number;
  modifiedAt: number;
  editedAt: number;
  archivedAt?: number;
  deletedAt?: number;
  pinnedAt?: number;
  tags: string[];
  blobs: BlobRef[];
}

export interface Notebook {
  id: string;
  name: string;
  modifiedAt: number;
}

function getTagValue(tags: string[][], name: string): string | undefined {
  const tag = tags.find(([t]) => t === name);
  return tag?.[1];
}

function getTagNumber(tags: string[][], name: string): number | undefined {
  const val = getTagValue(tags, name);
  if (val === undefined) return undefined;
  const num = parseInt(val, 10);
  return isNaN(num) ? undefined : num;
}

export function parseNoteRumor(rumor: Rumor): Note {
  const tags = rumor.tags;

  const id = getTagValue(tags, "d") ?? rumor.id;
  const title = getTagValue(tags, "title") ?? "";
  const content = rumor.content;

  // Reconstruct full markdown with title line (same as sync.rs line 494-498)
  const markdown = title ? `# ${title}\n\n${content}` : content;

  const modifiedAt =
    getTagNumber(tags, "modified_at") ?? rumor.created_at * 1000;
  const editedAt = getTagNumber(tags, "edited_at") ?? modifiedAt;
  const createdAt = getTagNumber(tags, "created_at") ?? modifiedAt;

  const notebookId = getTagValue(tags, "notebook_id");
  const archivedAt = getTagNumber(tags, "archived_at");
  const deletedAt = getTagNumber(tags, "deleted_at");
  const pinnedAt = getTagNumber(tags, "pinned_at");

  // Collect t (hashtag) tags
  const hashTags = tags.filter(([t]) => t === "t").map(([, v]) => v);

  // Collect blob tags: ["blob", plaintextHash, ciphertextHash, encryptionKey]
  const blobs: BlobRef[] = tags
    .filter(([t]) => t === "blob")
    .map(([, plaintextHash, ciphertextHash, encryptionKey]) => ({
      plaintextHash,
      ciphertextHash,
      encryptionKey,
    }));

  return {
    id,
    title,
    markdown,
    notebookId,
    createdAt,
    modifiedAt,
    editedAt,
    archivedAt,
    deletedAt,
    pinnedAt,
    tags: hashTags,
    blobs,
  };
}

export function parseNotebookRumor(rumor: Rumor): Notebook {
  const tags = rumor.tags;

  const id = getTagValue(tags, "d") ?? rumor.id;
  const name = getTagValue(tags, "title") ?? "";
  const modifiedAt =
    getTagNumber(tags, "modified_at") ?? rumor.created_at * 1000;

  return { id, name, modifiedAt };
}

/**
 * Determine the type of rumor from its tags.
 * Returns "note", "notebook", or undefined if unknown.
 */
export function getRumorType(rumor: Rumor): "note" | "notebook" | undefined {
  const typeTag = getTagValue(rumor.tags, "type");
  if (typeTag === "note") return "note";
  if (typeTag === "notebook") return "notebook";
  return undefined;
}
