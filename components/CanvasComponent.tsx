import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import PinPopup from '@/components/PinPopup';
import useSiteStore from '@/store/useSiteStore';

const elementConfig = {
  "pin": "blue",
};

type Point = {
  id: string;
  x: number;
  y: number;
  images: Image[];
  comment: string;
};

type Image = {
  key: string; // Key to retrieve the image from local storage
  pointIndex: number;
};

// @ts-ignore
function CanvasComponent({dataUrl}) {
  const [selectedPoint, setSelectedPoint] = useState(null);  // For showing selected pin in popup
  const [showPinPopup, setShowPinPopup] = useState(false);  // Controls the visibility of the popup
  const dimensions = useSiteStore((state) => state.canvasDimensions);  // Get canvas dimensions from the store
  const canvasRef = useRef(null);

  // Store states (for pins)
  const canvasDimensions = useSiteStore((state) => state.canvasDimensions);
  const plans = useSiteStore((state) => state.plans);  // Get plans (including points) from the store
  const addPoint = useSiteStore((state) => state.addPoint);  // To add a new pin to the store

  const currentPlan = plans.find((plan) => plan.url === dataUrl);  // Find the current plan by its ID
  const points = currentPlan?.points || [];  // Get points from the plan


  const renderPoints = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // @ts-ignore
    const context = canvas.getContext('2d');
    if (!context) return;

    // Clear the canvas before rendering points
    // @ts-ignore
    context.clearRect(0, 0, canvas.width, canvas.height);

    points.forEach((point) => {
      context.fillStyle = elementConfig["pin"];
      context.fillRect(point.x - 5, point.y - 5, 10, 10); // Render pins as small blue squares
    });
  }, [points]);
  // Handle pointer down to add or select a pin
  // @ts-ignore
  const handlePointerDown = (event) => {
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
      setSelectedPoint(closestPoint);
      setShowPinPopup(true);  // Show the popup if a point is clicked
    } else {
      // If no close pin is found, add a new pin
      const pointId = Date.now().toString();
      const newPoint = { id: pointId, x, y, images: [], comment: '' };
      addPoint(currentPlan.id, newPoint);  // Add the new point to the store
      renderPoints();  // Re-render points after adding a new one
    }
  };

  // Helper function to calculate the distance between two points
//@ts-ignore
  const calcDistance = (p1, p2) => {
    const a = p1.x - p2.x;
    const b = p1.y - p2.y;
    return Math.sqrt(a * a + b * b);
  };

  // Find the closest pin to the pointer
//@ts-ignore
const findClosestPin = useCallback(
    (pointer: { x: number; y: number }) => {
    // @ts-ignore
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

  // UseLayoutEffect to render points when the component is mounted or points change
  useLayoutEffect(() => {
    renderPoints();
  }, [renderPoints]);

  return (
    <>
      {/* Canvas for rendering pins */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas
          ref={canvasRef}
          // @ts-ignore
          width={canvasDimensions.width}
          // @ts-ignore
          height={canvasDimensions.height}
          className="border border-black rounded-md bg-transparent inset-0 absolute z-10"
          onPointerDown={handlePointerDown}
        />
        
        {/* Pin Popup for the selected pin */}
        {showPinPopup && selectedPoint && (
          <PinPopup
            setShowPinPopup={setShowPinPopup}
            selectedPoint={selectedPoint}  // Pass the selected pin to the popup
            planId={currentPlan?.id || ''}  // Pass the current plan ID to the popup
          />
        )}
      </div>
    </>
  );
}

export default CanvasComponent;
