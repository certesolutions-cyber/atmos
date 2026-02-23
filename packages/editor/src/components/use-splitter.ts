import { useCallback, useRef } from 'react';

export function useSplitter(
  direction: 'horizontal' | 'vertical',
  onDrag: (delta: number) => void,
): { onMouseDown: (e: React.MouseEvent) => void } {
  const startRef = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = direction === 'horizontal' ? e.clientX : e.clientY;

    const onMouseMove = (ev: MouseEvent) => {
      const current = direction === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = current - startRef.current;
      startRef.current = current;
      onDrag(delta);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [direction, onDrag]);

  return { onMouseDown };
}
