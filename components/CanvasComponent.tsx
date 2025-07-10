import React, { useRef, useLayoutEffect, useCallback, useState, useMemo, useEffect } from 'react';
import useSiteStore from '@/store/useSiteStore';
import pinSvg from './pin_svg';
import PinPopup from './PinPopup';

// TODO: double click for pin drops
// pin popup to show in middle of innerwindow, rather than centre of pdf/perhaps could be offset to pin location
// check that pointer is held down for full 0.5s i.e. one state change on pointer down, one on pointer up; if pointer up before 0.5s, then no highlight
const elementConfig = {
  "pin": "blue",
};

type Point = {
  id: string;
  x: number;
  y: number;
  images: Image[];
  comment: string;
  planId: string;
};

type Image = {
  key: string; // Key to retrieve the image from local storage
  pointIndex: number;
};

// Replace the PNG image with an inline SVG
// const pinSvg = `
// <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
//   <circle cx="12" cy="12" r="10" fill="blue"/>
// </svg>`;


// @ts-ignore
function CanvasComponent({pdfId}) {
  const dimensions = useSiteStore((state) => state.canvasDimensions);
  const canvasRef = useRef(null);

  // Store states (for pins)
  const canvasDimensions = useSiteStore((state) => state.canvasDimensions);
  const selectedProjectId = useSiteStore((state) => state.selectedProjectId);
  const selectedProject = useSiteStore((state) => 
    state.projects.find(p => p.id === state.selectedProjectId)
  );
  const { currentPlan, plans } = useMemo(() => ({
    plans: selectedProject?.plans || [],
    currentPlan: selectedProject?.plans.find((plan) => plan.id === pdfId)
  }), [selectedProject, pdfId]);
  const addPoint = useSiteStore((state) => state.addPoint);
  const points = useMemo(() => currentPlan?.points || [], [currentPlan]);
  const pdfLoaded = useSiteStore((state) => state.pdfLoaded);
  const [startHoldTime, setStartHoldTime] = useState<number|null>(null);
  const [pointerIsUp, setPointerIsUp] = useState<boolean>(true);
  const [pointerDownLocation, setPointerDownLocation] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [movablePoint, setMovablePoint] = useState<Point | null>(null);
  const [pinImage, setPinImage] = useState<HTMLImageElement | null>(null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isMovingRef = useRef(false);

  // ✅ Reference branch pattern: Store only the ID, not the full object
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [showPinPopup, setShowPinPopup] = useState(false);

  // ✅ Reference branch pattern: Derive fresh selectedPoint from store using ID
  const selectedPoint = useMemo(() => {
    if (!selectedPointId || !currentPlan) return null;
    const freshPoint = currentPlan.points.find(point => point.id === selectedPointId);
    console.log('🔄 Deriving fresh selectedPoint from store:', {
      selectedPointId,
      freshPoint,
      images: freshPoint?.images,
      comment: freshPoint?.comment
    });
    return freshPoint || null;
  }, [selectedPointId, currentPlan]);

  useEffect(() => {
    const loadPinImage = () => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(pinSvg);
      
      return new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = (e) => {
          console.error('Error loading pin SVG:', e);
          reject(e);
        };
      });
    };

    loadPinImage()
      .then((img) => setPinImage(img as HTMLImageElement))
      .catch((error) => console.error('Failed to load pin image:', error));

    // Cleanup
    return () => {
      setPinImage(null);
    };
  }, []);

  const renderPoints = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pinImage) return;
    // @ts-ignore
    const context = canvas.getContext('2d');
    if (!context) return;

    // Clear the canvas before rendering points
    // @ts-ignore
    context.clearRect(0, 0, canvas.width, canvas.height);

    points.forEach((point, index) => {
      if (!pinImage) return; // Skip if pinImage isn't loaded

      const dimensionMultiplier = 30;
      const pinWidth = dimensionMultiplier * 800/1080;
      const pinHeight = dimensionMultiplier;
      
      try {
        context.drawImage(
          pinImage, 
          point.x - pinWidth/2, 
          point.y - pinHeight,
          pinWidth, 
          pinHeight
        );
        
        // Draw the number
        context.fillStyle = 'white';
        context.font = '12px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText((index + 1).toString(), point.x, point.y-pinHeight*13/20);
      } catch (error) {
        console.error('Error drawing pin:', error);
      }
    });
  }, [points, pinImage]);
  //@ts-ignore
  const findClosestPin = useCallback(
    (pointer: { x: number; y: number }) => {
      let closestPoint: Point | null = null;
      let closestDistance: number | null = null;

      points.forEach((currentP) => {
        const currentDistance = calcDistance(pointer, currentP);
        if (currentDistance < 15 && (closestDistance === null || currentDistance < closestDistance)) {
          closestDistance = currentDistance;
          closestPoint = currentP;
        }
      });

      return closestPoint;
    },
    [points]
  );



  // ✅ Fixed handleCanvasClick to store ID and show popup (reference branch pattern)
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime;
    const doubleClickDelay = 500;
    // @ts-ignore
    if (event.sourceCapabilities?.firesTouchEvents && isMovingRef.current) {
      return;
    }

    // @ts-ignore
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas || !currentPlan) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const pointer = { x, y };

    if (timeSinceLastClick < doubleClickDelay) {
      // Double click detected - add new pin or select existing
      const closestPoint = findClosestPin(pointer);
      if (closestPoint) {
        // ✅ Store only the ID and show popup (reference branch pattern)
        // @ts-ignore
        console.log('🎯 Opening popup for pinId:', closestPoint.id);
        // @ts-ignore
        setSelectedPointId(closestPoint.id);
        setShowPinPopup(true);
      } else {
        // ✅ Create new pin and store its ID
        const pointId = Date.now().toString();
        const newPoint = { id: pointId, x, y, images: [], comment: '', planId: currentPlan.id };
        console.log('📍 Creating new pin with ID:', pointId);
        addPoint(currentPlan.id, newPoint);
        renderPoints();
        setSelectedPointId(pointId);
        setShowPinPopup(true);
      }
      setLastClickTime(0);
    } else {
      setLastClickTime(now);
    }
  }, [lastClickTime, currentPlan, findClosestPin, addPoint, renderPoints]);

  // @ts-ignore
  const handleTouchStart = useCallback((event) => {
    const touch = event.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    isMovingRef.current = false;
  }, []);

  // @ts-ignore
  const handleTouchMove = useCallback((event) => {
    const touch = event.touches[0];
    
    const deltaX = touch.clientX - startPosRef.current.x;
    const deltaY = touch.clientY - startPosRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > 10) { // 10px threshold
      isMovingRef.current = true;
    }
  }, []);

  // @ts-ignore
  const handlePointerDown = (event) => { // needs to be hold for 0.5s, highlight, then move
    setPointerIsUp(false);
    // if pointer up after 0.5s or x,y changed -> won't highlight pin
    // if not double click!!!
    const canvas = canvasRef.current;
    if (!canvas || !currentPlan) return;
    // @ts-ignore
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const pointer = { x, y };

    // Check if the pointer is close to any existing point (within a certain threshold)
    const closestPoint = findClosestPin(pointer);
    if (closestPoint) {
      // add closestPoint to state for drag
      // start timer, then highlight point
      setStartHoldTime(Date.now());
      setPointerDownLocation({x, y});
      // then move to pointer up location
      
      setMovablePoint(closestPoint);

    } else {
      setStartHoldTime(null);
      setMovablePoint(null);
      // // If no close pin is found, add a new pin
      // const pointId = Date.now().toString();
      // const newPoint = { id: pointId, x, y, images: [], comment: '' };
      // addPoint(currentPlan.id, newPoint);  // Add the new point to the store
      // renderPoints();  // Re-render points after adding a new one
    }
  };

  // @ts-ignore
  const handlePointerHeldDown = (event) => {
    if (startHoldTime) {
      const timeoutId = setTimeout(() => {
        if (pointerIsUp) return;

        const canvas = canvasRef.current;
        if (!canvas || !currentPlan) return;
        // @ts-ignore
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
      
        const pointer = { x, y };
        // check pointer is close to previous pointerdown location
        let pointerDownLocationX = pointerDownLocation.x;
        let pointerDownLocationY = pointerDownLocation.y;
        // should be +5 or -5 pixels

        if (pointer.x -15 < pointerDownLocationX && pointer.x +15 > pointerDownLocationX  && pointer.y -15 < pointerDownLocationY && pointer.y +15 > pointerDownLocationY) {
          // see if pointer is up
          
          // see if pointer is same location as before
          // if so, highlight pin - set pin to selected/moving
          setMovablePoint(movablePoint);
          // then move point to pointer up location
          // future - add point whilst moving

        }
     }, 800); // 3000 milliseconds = 3 seconds
     timeoutId
      // action time delay of 0.5s
    
    } 
  }

  // for drag to move pin
  // @ts-ignore
  const handlePointerUp = (event) => {

    setPointerIsUp(true);
    if (movablePoint) {
      const canvas = canvasRef.current;
      if (!canvas || !currentPlan) return;
      // @ts-ignore
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
    
      const pointer = { x, y };
      // changePointLocation(currentPlan.id, movablePoint.id, x, y);
    }
  }


  // Helper function to calculate the distance between two points
  //@ts-ignore
  const calcDistance = (p1, p2) => {
    const a = p1.x - p2.x;
    const b = p1.y - p2.y;
    return Math.sqrt(a * a + b * b);
  };

  // UseLayoutEffect to render points when the component is mounted or points change
  // should be after pdf is loaded
  useLayoutEffect(() => {
    if (pdfLoaded) {

      renderPoints();
    }
  }, [renderPoints, pdfLoaded]);

  return (
    <>
      {/* Canvas for rendering pins */}
      <div style={{ position: 'relative', width: '100%', height: '100%', zIndex:100 }}>
        <canvas
          ref={canvasRef}
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          className="border border-black rounded-md bg-transparent inset-0 absolute z-10"
          onClick={handleCanvasClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerUp}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerHeldDown}
        />
        
        {/* ✅ Popup with fresh selectedPoint (reference branch pattern) */}
        {showPinPopup && selectedPoint && (
          <PinPopup
            setShowPinPopup={setShowPinPopup}
            selectedPoint={selectedPoint}  // Always fresh from store!
            planId={currentPlan?.id || ''}
          />
        )}
      </div>
    </>
  );
}

export default CanvasComponent;
