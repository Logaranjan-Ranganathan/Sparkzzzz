import { createContext, useContext, useEffect, useState } from 'react';

const THEME_STORAGE_KEY = 'urbangrid_theme';

const ThemeContext = createContext({
  theme: 'light',
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [effectiveDark, setEffectiveDark] = useState(() => {
    if (theme === 'system') {
      return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    }
    return theme === 'dark';
  });

  useEffect(() => {
    const isDark =
      theme === 'system'
        ? Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
        : theme === 'dark';

    setEffectiveDark(isDark);

    const root = document.documentElement;
    const body = document.body;

    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.classList.toggle('dark', isDark);
    if (body) {
      body.classList.toggle('dark', isDark);
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // storage unavailable
    }
  }, [theme]);

  // Listen to system changes when set to 'system'
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;

    const handler = (e) => {
      setEffectiveDark(e.matches);
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', e.matches);
      document.body?.classList.toggle('dark', e.matches);
    };

    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [theme]);

  const setTheme = (next) => {
    setThemeState(next);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark: effectiveDark, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
