export function documentScopeKey(
  recipient: string,
  documentCoord: string,
): string {
  return `${recipient}:${documentCoord}`;
}

export function revisionScopeKey(
  recipient: string,
  documentCoord: string,
  revisionId: string,
): string {
  return `${recipient}:${documentCoord}:${revisionId}`;
}
