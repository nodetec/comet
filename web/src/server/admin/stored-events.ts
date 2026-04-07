import { sql } from "drizzle-orm";

export type StoredEventSource = "relay" | "revision";

export type StoredEventCursor = {
  createdAt: number;
  id: string;
  source: StoredEventSource;
};

export type StoredEventRow = {
  id: string;
  pubkey: string;
  kind: number | string;
  created_at: number | string;
  content: string;
  source: StoredEventSource;
};

export type StoredEventsByKindRow = {
  kind: number | string;
  count: number | string;
};

export type StoredEventsOverTimeRow = {
  day: string;
  count: number | string;
};

export function parseStoredEventCursor(
  cursor: string | undefined,
): StoredEventCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(cursor) as Partial<StoredEventCursor>;
    if (
      typeof parsed.createdAt === "number" &&
      Number.isFinite(parsed.createdAt) &&
      typeof parsed.id === "string" &&
      (parsed.source === "relay" || parsed.source === "revision")
    ) {
      return parsed as StoredEventCursor;
    }
  } catch {
    // Ignore malformed cursors and treat them as absent.
  }

  return null;
}

function storedEventsCte() {
  return sql`
    WITH combined AS (
      SELECT
        id,
        pubkey,
        kind,
        created_at,
        content,
        'relay'::text AS source
      FROM relay_events
      UNION ALL
      SELECT
        event_id AS id,
        pubkey,
        kind,
        created_at,
        content,
        'revision'::text AS source
      FROM sync_payloads
    )
  `;
}

function storedEventWhereClause(input: {
  kind?: number;
  pubkey?: string;
  cursor?: StoredEventCursor | null;
}) {
  const clauses = [];

  if (input.kind !== undefined) {
    clauses.push(sql`kind = ${input.kind}`);
  }

  if (input.pubkey !== undefined) {
    clauses.push(sql`pubkey = ${input.pubkey}`);
  }

  if (input.cursor) {
    clauses.push(
      sql`(created_at, id, source) < (${input.cursor.createdAt}, ${input.cursor.id}, ${input.cursor.source})`,
    );
  }

  return clauses.length > 0
    ? sql`WHERE ${sql.join(clauses, sql` AND `)}`
    : sql``;
}

export function buildStoredEventsListQuery(input: {
  kind?: number;
  pubkey?: string;
  cursor?: StoredEventCursor | null;
  limit: number;
}) {
  const whereClause = storedEventWhereClause(input);

  return sql`
    ${storedEventsCte()}
    SELECT id, pubkey, kind, created_at, content, source
    FROM combined
    ${whereClause}
    ORDER BY created_at DESC, id DESC, source DESC
    LIMIT ${input.limit}
  `;
}

export function buildStoredEventsCountQuery(filter?: { pubkey?: string }) {
  const where = filter?.pubkey ? sql`WHERE pubkey = ${filter.pubkey}` : sql``;
  return sql`
    ${storedEventsCte()}
    SELECT COUNT(*)::bigint AS val
    FROM combined
    ${where}
  `;
}

export function buildStoredEventsByKindQuery(limit: number, pubkey?: string) {
  const where = pubkey ? sql`WHERE pubkey = ${pubkey}` : sql``;
  return sql`
    ${storedEventsCte()}
    SELECT kind, COUNT(*)::bigint AS count
    FROM combined
    ${where}
    GROUP BY kind
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `;
}

export function buildStoredEventsOverTimeQuery(
  thirtyDaysAgo: number,
  pubkey?: string,
) {
  const pubkeyClause = pubkey ? sql` AND pubkey = ${pubkey}` : sql``;
  return sql`
    ${storedEventsCte()}
    SELECT
      TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::bigint AS count
    FROM combined
    WHERE created_at >= ${thirtyDaysAgo}${pubkeyClause}
    GROUP BY day
    ORDER BY day
  `;
}
