/**
 * useFormPersist — persists form state to localStorage so that if the session
 * expires mid-form, the user can re-login and return to find their data intact.
 *
 * Usage:
 *   const [form, setForm] = useFormPersist("quick-capture-form", EMPTY_FORM);
 *
 * The state is automatically cleared when the user submits (call clearPersistedForm()).
 */
import { useState, useEffect, useCallback } from "react";

const EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours — matches session lifetime

interface PersistedValue<T> {
  data: T;
  savedAt: number;
}

export function useFormPersist<T extends object>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const storageKey = `hibba_form_${key}`;

  const getInitial = (): T => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return initialValue;
      const parsed: PersistedValue<T> = JSON.parse(raw);
      // Discard stale data older than EXPIRY_MS
      if (Date.now() - parsed.savedAt > EXPIRY_MS) {
        localStorage.removeItem(storageKey);
        return initialValue;
      }
      return parsed.data;
    } catch {
      return initialValue;
    }
  };

  const [state, setState] = useState<T>(getInitial);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      const value: PersistedValue<T> = { data: state, savedAt: Date.now() };
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable (private browsing)
    }
  }, [state, storageKey]);

  const clearPersistedForm = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setState(initialValue);
  }, [storageKey, initialValue]);

  return [state, setState, clearPersistedForm];
}
