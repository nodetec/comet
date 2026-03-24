export function documentScopeKey(
  recipient: string,
  documentId: string,
): string {
  return `${recipient}:${documentId}`;
}

export function revisionScopeKey(
  recipient: string,
  documentId: string,
  revisionId: string,
): string {
  return `${recipient}:${documentId}:${revisionId}`;
}
