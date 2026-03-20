import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { RelayClient } from "~/lib/nostr/client";

const PUBKEY_STORAGE_KEY = "pubkey";

interface NostrContextValue {
  pubkey: string | null;
  isAuthenticated: boolean;
  relay: RelayClient | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  error: string | null;
}

const NostrContext = createContext<NostrContextValue | null>(null);

export function NostrProvider({ children }: { children: ReactNode }) {
  const [pubkey, setPubkey] = useState<string | null>(() =>
    localStorage.getItem(PUBKEY_STORAGE_KEY),
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [relay, setRelay] = useState<RelayClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  const relayRef = useRef<RelayClient | null>(null);

  const connectRelay = useCallback((_pk: string) => {
    const relayUrl = import.meta.env.VITE_RELAY_URL as string;
    const r = new RelayClient(relayUrl);
    relayRef.current = r;

    // Guard: only update state if this relay is still the active one.
    // Prevents a stale relay's async onclose from resetting state after
    // a new relay has already connected (e.g. React StrictMode double-mount).
    r.onAuth = () => {
      if (relayRef.current === r) {
        setIsAuthenticated(true);
        setRelay(r);
      }
    };

    r.onClose = () => {
      if (relayRef.current === r) {
        setIsAuthenticated(false);
        setRelay(null);
      }
    };

    r.connect();
  }, []);

  const signIn = useCallback(async () => {
    if (!window.nostr) {
      setError("Install a Nostr extension (Alby, nos2x) to sign in");
      throw new Error("NIP-07 extension not available");
    }

    setError(null);

    try {
      const pk = await window.nostr.getPublicKey();
      localStorage.setItem(PUBKEY_STORAGE_KEY, pk);
      setPubkey(pk);
      connectRelay(pk);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sign in";
      setError(message);
      throw err;
    }
  }, [connectRelay]);

  const signOut = useCallback(() => {
    localStorage.removeItem(PUBKEY_STORAGE_KEY);
    setPubkey(null);
    setIsAuthenticated(false);
    setRelay(null);
    if (relayRef.current) {
      relayRef.current.disconnect();
      relayRef.current = null;
    }
  }, []);

  // Auto-connect on mount if pubkey exists in localStorage
  useEffect(() => {
    if (pubkey && !relayRef.current) {
      connectRelay(pubkey);
    }
    return () => {
      if (relayRef.current) {
        relayRef.current.disconnect();
        relayRef.current = null;
      }
    };
    // Only run on mount; connectRelay is stable (stable useCallback ref)
  }, []);

  return (
    <NostrContext.Provider
      value={{ pubkey, isAuthenticated, relay, signIn, signOut, error }}
    >
      {children}
    </NostrContext.Provider>
  );
}

export function useNostr(): NostrContextValue {
  const context = useContext(NostrContext);
  if (!context) {
    throw new Error("useNostr must be used within a NostrProvider");
  }
  return context;
}
