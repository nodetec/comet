import { useEffect, useEffectEvent, useRef } from "react";

type RequestWithId = { requestId: number };

/**
 * Subscribe to a request object from a command store. The handler fires
 * at most once per requestId. Return `false` from the handler to defer —
 * the ref stays unmarked so a later render (e.g. after a dep listed in
 * `retryDeps` changes) can re-attempt the same request.
 */
export function useCommandRequest<T extends RequestWithId>(
  request: T | null,
  handler: (request: T) => boolean | void,
  retryDeps: unknown[] = [],
): void {
  const lastHandledIdRef = useRef(0);
  const handle = useEffectEvent(handler);

  useEffect(() => {
    if (!request || lastHandledIdRef.current === request.requestId) {
      return;
    }
    const handled = handle(request);
    if (handled === false) {
      return;
    }
    lastHandledIdRef.current = request.requestId;
  }, [request, ...retryDeps]);
}

export function useCommandRequestId(
  requestId: number,
  handler: () => void,
): void {
  const lastHandledIdRef = useRef(0);
  const handle = useEffectEvent(handler);

  useEffect(() => {
    if (requestId === 0 || lastHandledIdRef.current === requestId) {
      return;
    }
    lastHandledIdRef.current = requestId;
    handle();
  }, [requestId]);
}
