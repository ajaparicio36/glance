import { useSyncExternalStore } from 'react';

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function getMediaQuery(): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return undefined;
  }

  return window.matchMedia(COLOR_SCHEME_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mediaQuery = getMediaQuery();
  mediaQuery?.addEventListener('change', onChange);

  return () => mediaQuery?.removeEventListener('change', onChange);
}

function getSnapshot(): 'light' | 'dark' {
  return getMediaQuery()?.matches ? 'dark' : 'light';
}

function getServerSnapshot(): 'light' {
  return 'light';
}

export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
