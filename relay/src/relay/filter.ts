import type { NostrEvent, Filter } from "../types";

/**
 * Check if an event matches a single filter.
 * Fields are ANDed across, values within a field are ORed.
 */
export function matchFilter(event: NostrEvent, filter: Filter): boolean {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since && event.created_at < filter.since) return false;
  if (filter.until && event.created_at > filter.until) return false;

  for (const key of Object.keys(filter)) {
    if (key[0] === "#") {
      const tagName = key.slice(1);
      const values = filter[key as `#${string}`];
      if (!Array.isArray(values)) continue;
      const match = event.tags.some(
        ([t, v]) => t === tagName && values.includes(v),
      );
      if (!match) return false;
    }
  }

  return true;
}

/**
 * Check if an event matches any filter in the array (OR across filters).
 */
export function matchFilters(event: NostrEvent, filters: Filter[]): boolean {
  return filters.some((f) => matchFilter(event, f));
}
