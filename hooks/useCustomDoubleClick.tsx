import { useCallback, useRef, useState } from 'react';
import { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';

type ClickHandler = (e: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>) => void;

const useDoubleClick = ({
  onSingleClick,
  onDoubleClick,
  doubleClickDelay = 200,
  minMoveThreshold = 10,
  disabled = false
}: {
  onSingleClick?: ClickHandler;
  onDoubleClick?: ClickHandler;
  doubleClickDelay?: number;
  minMoveThreshold?: number;
  disabled?: boolean;
} = {}) => {
  const [lastClickTime, setLastClickTime] = useState(0);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isMovingRef = useRef(false);

  const handleTouchStart = useCallback((e: ReactTouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    isMovingRef.current = false;
  }, [disabled]);

  const handleTouchMove = useCallback((e: ReactTouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startPosRef.current.x;
    const deltaY = touch.clientY - startPosRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > minMoveThreshold) {
      isMovingRef.current = true;
    }
  }, [disabled, minMoveThreshold]);

  const handleClick = useCallback((e: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    
    // If this was from a touch event and we detected movement, ignore it
    if ('touches' in e && isMovingRef.current) {
      return;
    }

    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime;

    if (timeSinceLastClick < doubleClickDelay) {
      // Double click detected
      onDoubleClick?.(e);
      setLastClickTime(0); // Reset timer
    } else {
      // First click
      onSingleClick?.(e);
      setLastClickTime(now);
    }
  }, [disabled, doubleClickDelay, lastClickTime, onSingleClick, onDoubleClick]);

  const eventHandlers = {
    onClick: handleClick,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove
  };

  return eventHandlers;
};

export default useDoubleClick;