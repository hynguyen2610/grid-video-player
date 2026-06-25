import { useEffect, useState } from 'react';

export function useElementWidth<T extends HTMLElement>(element: T | null): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });

    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [element]);

  return width;
}
