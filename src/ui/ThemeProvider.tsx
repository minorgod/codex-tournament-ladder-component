import { createContext, useContext, useMemo, useState } from "react";
import type { CSSProperties, PropsWithChildren } from "react";

import type { ThemeMode, ThemeTokens } from "@/models";

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode(): void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  toggleMode: () => undefined,
});

const defaultTokens: ThemeTokens = {
  "--bracket-bg": "#f5f7f9",
  "--surface": "#ffffff",
  "--surface-2": "#eef1f5",
  "--border": "#c8d0da",
  "--text": "#1f2a37",
  "--muted": "#5f6b7a",
  "--winner": "#0f8b6f",
  "--loser": "#c44536",
  "--accent": "#d96b0b",
  "--focus": "#0f5cc0",
};

function normalizeContrast(tokens: ThemeTokens): ThemeTokens {
  const t = { ...tokens };
  if (t["--surface"].toLowerCase() === t["--text"].toLowerCase()) {
    t["--text"] = "#111111";
  }
  return t;
}

export function ThemeProvider(props: PropsWithChildren<{ mode?: ThemeMode; tokens?: Partial<ThemeTokens> }>) {
  const [mode, setMode] = useState<ThemeMode>(props.mode ?? "light");
  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      toggleMode: () => setMode((current) => (current === "light" ? "dark" : "light")),
    }),
    [mode],
  );

  const tokens = normalizeContrast({ ...defaultTokens, ...props.tokens });

  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={mode} style={tokens as CSSProperties}>
        {props.children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
