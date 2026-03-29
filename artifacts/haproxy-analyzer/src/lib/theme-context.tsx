import React, { createContext, useContext, useState, useEffect } from 'react';

export type DarkMode = 'dark' | 'light';
export type ColorTheme = 'red' | 'blue' | 'green' | 'orange' | 'pink' | 'default';

interface ThemeContextValue {
  darkMode: DarkMode;
  colorTheme: ColorTheme;
  toggleDarkMode: () => void;
  setColorTheme: (theme: ColorTheme) => void;
  theme: DarkMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  darkMode: 'dark',
  colorTheme: 'red',
  toggleDarkMode: () => {},
  setColorTheme: () => {},
  theme: 'dark',
  toggleTheme: () => {},
});

const DARK_MODE_CLASSES = ['dark', 'light'];
const COLOR_THEME_CLASSES = ['theme-red', 'theme-blue', 'theme-green', 'theme-orange', 'theme-pink', 'theme-default'];

function applyThemes(darkMode: DarkMode, colorTheme: ColorTheme) {
  const root = document.documentElement;
  root.classList.remove(...DARK_MODE_CLASSES, ...COLOR_THEME_CLASSES);
  if (darkMode === 'light') root.classList.add('light');
  root.classList.add(`theme-${colorTheme}`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState<DarkMode>(() => {
    try { return (localStorage.getItem('msb-dark') === 'light') ? 'light' : 'dark'; } catch { return 'dark'; }
  });

  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    try {
      const saved = localStorage.getItem('msb-color-theme') as ColorTheme | null;
      return (saved && ['red','blue','green','orange','pink','default'].includes(saved)) ? saved : 'red';
    } catch { return 'red'; }
  });

  useEffect(() => {
    applyThemes(darkMode, colorTheme);
    try { localStorage.setItem('msb-dark', darkMode); } catch {}
  }, [darkMode, colorTheme]);

  const toggleDarkMode = () => setDarkMode(m => m === 'dark' ? 'light' : 'dark');

  const setColorTheme = (theme: ColorTheme) => {
    setColorThemeState(theme);
    try { localStorage.setItem('msb-color-theme', theme); } catch {}
  };

  return (
    <ThemeContext.Provider value={{
      darkMode,
      colorTheme,
      toggleDarkMode,
      setColorTheme,
      theme: darkMode,
      toggleTheme: toggleDarkMode,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
