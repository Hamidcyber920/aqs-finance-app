/**
 * useHibbaFormFill — Hook for pages to listen to Hibba's form-fill commands.
 * 
 * Usage in any page component:
 *   const { lastFill, confirmed } = useHibbaFormFill("/receipts", (fields) => {
 *     setFormData(prev => ({ ...prev, ...fields }));
 *   }, onConfirm);
 * 
 * Hibba extracts data from voice and dispatches a custom event.
 * This hook listens for that event and calls your handler with the fields.
 * When the user clicks "Confirm & Save", the onConfirm callback is called.
 */
import { useEffect, useState, useCallback } from "react";

interface FormFillEvent {
  fields: Record<string, any>;
  page: string;
  action: "fill" | "fill_and_confirm";
}

export function useHibbaFormFill(
  pagePath: string,
  onFill: (fields: Record<string, any>, action: string) => void,
  onConfirm?: (fields: Record<string, any>) => void
) {
  const [lastFill, setLastFill] = useState<FormFillEvent | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const handler = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as FormFillEvent;
    // Only handle events for this page
    if (detail.page === pagePath || detail.page === window.location.pathname) {
      setLastFill(detail);
      setConfirmed(false);
      onFill(detail.fields, detail.action);
    }
  }, [pagePath, onFill]);

  const confirmHandler = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as { fields: Record<string, any>; page: string };
    if (detail.page === pagePath || detail.page === window.location.pathname) {
      setConfirmed(true);
      if (onConfirm) {
        onConfirm(detail.fields);
      }
    }
  }, [pagePath, onConfirm]);

  useEffect(() => {
    window.addEventListener("hibba:fill_form", handler);
    window.addEventListener("hibba:confirm_form_fill", confirmHandler);
    return () => {
      window.removeEventListener("hibba:fill_form", handler);
      window.removeEventListener("hibba:confirm_form_fill", confirmHandler);
    };
  }, [handler, confirmHandler]);

  return { lastFill, confirmed };
}
