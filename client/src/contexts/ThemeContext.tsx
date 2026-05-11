import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
  density: Density;
  setDensity: (d: Density) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  const [density, setDensityState] = useState<Density>(() => {
    const stored = localStorage.getItem("density");
    return (stored as Density) || "comfortable";
  });

  // Apply dark class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  // Apply density class
  useEffect(() => {
    const root = document.documentElement;
    if (density === "compact") {
      root.classList.add("density-compact");
    } else {
      root.classList.remove("density-compact");
    }
    localStorage.setItem("density", density);
  }, [density]);

  const toggleTheme = switchable
    ? () => setTheme(prev => (prev === "light" ? "dark" : "light"))
    : undefined;

  const setDensity = (d: Density) => setDensityState(d);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable, density, setDensity }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
