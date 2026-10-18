import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './ThemeContext.jsx';

export default function ThemeToggle({ className = '', showLabel = false, size = 'md' }) {
  const { theme, isDark, setTheme, toggleTheme } = useTheme();

  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  if (showLabel) {
    return (
      <div className={`theme-toggle-group ${className}`} role="group" aria-label="Theme selection">
        <button
          type="button"
          className={`theme-chip-btn ${theme === 'light' ? 'is-active' : ''}`}
          onClick={() => setTheme('light')}
          aria-label="Light mode"
        >
          <Sun className={iconClass} />
          <span>Light</span>
        </button>
        <button
          type="button"
          className={`theme-chip-btn ${theme === 'dark' ? 'is-active' : ''}`}
          onClick={() => setTheme('dark')}
          aria-label="Dark mode"
        >
          <Moon className={iconClass} />
          <span>Dark</span>
        </button>
        <button
          type="button"
          className={`theme-chip-btn ${theme === 'system' ? 'is-active' : ''}`}
          onClick={() => setTheme('system')}
          aria-label="System default"
        >
          <Monitor className={iconClass} />
          <span>Auto</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`theme-btn ${className}`}
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Sun className={`${iconClass} text-amber-400`} />
      ) : (
        <Moon className={`${iconClass} text-slate-700`} />
      )}
    </button>
  );
}
