export function documentScopeKey(
  authorPubkey: string,
  documentCoord: string,
): string {
  return `${authorPubkey}:${documentCoord}`;
}

export function revisionScopeKey(
  authorPubkey: string,
  documentCoord: string,
  revisionId: string,
): string {
  return `${authorPubkey}:${documentCoord}:${revisionId}`;
}
