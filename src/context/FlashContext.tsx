import { createContext, useEffect, useMemo, useRef, useState } from 'react';

export type FlashTone = 'success' | 'warning' | 'danger' | 'info';

interface FlashState {
  id: number;
  message: string;
  tone: FlashTone;
}

interface FlashContextValue {
  flash: FlashState | null;
  showFlash: (message: string, tone?: FlashTone, durationMs?: number) => void;
  clearFlash: () => void;
}

export const FlashContext = createContext<FlashContextValue | undefined>(undefined);

export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [flash, setFlash] = useState<FlashState | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const value = useMemo<FlashContextValue>(
    () => ({
      flash,
      showFlash(message, tone = 'info', durationMs = 2600) {
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
        }

        const id = Date.now();
        setFlash({ id, message, tone });
        timeoutRef.current = window.setTimeout(() => {
          setFlash((current) => (current?.id === id ? null : current));
        }, durationMs);
      },
      clearFlash() {
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setFlash(null);
      },
    }),
    [flash],
  );

  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}
