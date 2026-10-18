import { create } from 'zustand';

export type Theme = 'light' | 'dark';

// Keep in sync with the inline script in index.html, which applies the theme before first paint.
const STORAGE_KEY = 'pg:theme';
const META_COLORS: Record<Theme, string> = { dark: '#0b0b14', light: '#f5f5fa' };

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
}

interface ThemeState {
  theme: Theme;
  toggle(): void;
}

export const useTheme = create<ThemeState>()((set, get) => ({
  theme: storedTheme() ?? systemTheme(),
  toggle() {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Choice lasts for this visit only.
    }
    apply(next);
    set({ theme: next });
  },
}));

/** Apply the initial theme, and follow the OS setting until the user picks one. */
export function startTheme(): void {
  apply(useTheme.getState().theme);
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (storedTheme() !== null) return;
    const theme = systemTheme();
    apply(theme);
    useTheme.setState({ theme });
  });
}
