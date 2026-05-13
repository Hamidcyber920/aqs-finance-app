/**
 * VoiceContext — allows any page to broadcast entity context to Hibba.
 * Usage in a page:
 *   const { setEntityContext } = useVoiceContext();
 *   useEffect(() => { setEntityContext("Donor: Ahmed Khan (ID 42)"); return () => setEntityContext(null); }, [donor]);
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface VoiceContextValue {
  entityContext: string | null;
  setEntityContext: (ctx: string | null) => void;
}

const VoiceContext = createContext<VoiceContextValue>({
  entityContext: null,
  setEntityContext: () => {},
});

export function VoiceContextProvider({ children }: { children: ReactNode }) {
  const [entityContext, setEntityContextState] = useState<string | null>(null);

  const setEntityContext = useCallback((ctx: string | null) => {
    setEntityContextState(ctx);
  }, []);

  return (
    <VoiceContext.Provider value={{ entityContext, setEntityContext }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoiceContext() {
  return useContext(VoiceContext);
}
