import { useRef, useEffect } from 'react';

/**
 * Hook to track if component is mounted
 * Prevents setState on unmounted components
 */
export const useIsMounted = () => {
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return isMounted;
};

