import { useState, useEffect } from 'react';

const useMediaQuery = (query: string): boolean => {
  const getMatches = (q: string): boolean => {
    if (typeof window !== 'undefined' && 'matchMedia' in window) {
      return window.matchMedia(q).matches;
    }
    return false; // default for SSR or unsupported environments
  };

  const [matches, setMatches] = useState(getMatches(query));

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQueryList.addEventListener('change', listener);

    // Set the initial value in case it has changed between renders
    setMatches(mediaQueryList.matches);

    return () => {
      mediaQueryList.removeEventListener('change', listener);
    };
  }, [query]);

  return matches;
};

export default useMediaQuery;
