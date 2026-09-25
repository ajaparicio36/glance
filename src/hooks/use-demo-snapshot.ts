import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getDemoSnapshot, type DemoSnapshot } from '@/data/demo-store';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Could not load the saved demo state.';
}

export function useDemoSnapshot() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      void getDemoSnapshot()
        .then((nextSnapshot) => {
          if (!isActive) return;
          setSnapshot(nextSnapshot);
          setLoadError(null);
        })
        .catch((error: unknown) => {
          if (isActive) setLoadError(getErrorMessage(error));
        })
        .finally(() => {
          if (isActive) setIsLoading(false);
        });

      return () => {
        isActive = false;
      };
    }, []),
  );

  const refresh = useCallback(async (): Promise<DemoSnapshot> => {
    const nextSnapshot = await getDemoSnapshot();
    setSnapshot(nextSnapshot);
    setLoadError(null);
    return nextSnapshot;
  }, []);

  return { snapshot, isLoading, loadError, refresh };
}
