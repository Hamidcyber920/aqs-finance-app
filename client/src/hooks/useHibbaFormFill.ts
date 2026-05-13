/**
 * useHibbaFormFill — Hook for pages to listen to Hibba's form-fill commands.
 * 
 * Usage in any page component:
 *   const { lastFill } = useHibbaFormFill("/receipts", (fields) => {
 *     setFormData(prev => ({ ...prev, ...fields }));
 *   });
 * 
 * Hibba extracts data from voice and dispatches a custom event.
 * This hook listens for that event and calls your handler with the fields.
 */
import { useEffect, useState, useCallback } from "react";

interface FormFillEvent {
  fields: Record<string, any>;
  page: string;
  action: "fill" | "fill_and_confirm";
}

export function useHibbaFormFill(
  pagePath: string,
  onFill: (fields: Record<string, any>, action: string) => void
) {
  const [lastFill, setLastFill] = useState<FormFillEvent | null>(null);

  const handler = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as FormFillEvent;
    // Only handle events for this page
    if (detail.page === pagePath || detail.page === window.location.pathname) {
      setLastFill(detail);
      onFill(detail.fields, detail.action);
    }
  }, [pagePath, onFill]);

  useEffect(() => {
    window.addEventListener("hibba:fill_form", handler);
    return () => window.removeEventListener("hibba:fill_form", handler);
  }, [handler]);

  return { lastFill };
}
