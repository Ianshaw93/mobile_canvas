import React, { useState, useLayoutEffect, useRef, useCallback } from 'react';
import PinPopup from '@/components/PinPopup';
import useSiteStore from '@/store/useSiteStore';


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
};

type Image = {
  key: string; // Key to retrieve the image from local storage
  pointIndex: number;
};

// @ts-ignore
function CanvasComponent({pdfId, zoomLevel, onZoomChange}) {
  const [selectedPoint, setSelectedPoint] = useState(null);  // For showing selected pin in popup
  const [showPinPopup, setShowPinPopup] = useState(false);  // Controls the visibility of the popup
  const dimensions = useSiteStore((state) => state.canvasDimensions);  // Get canvas dimensions from the store
  const canvasRef = useRef(null);

  // Store states (for pins)
  const canvasDimensions = useSiteStore((state) => state.canvasDimensions);
  const plans = useSiteStore((state) => state.plans);  // Get plans (including points) from the store
  const addPoint = useSiteStore((state) => state.addPoint);  // To add a new pin to the store
  const changePointLocation = useSiteStore((state) => state.changePointLocation);  // To change the location of a pin
  const currentPlan = plans.find((plan) => plan.id === pdfId);  // Find the current plan by its ID
  const points = currentPlan?.points || [];  // Get points from the plan
  const pdfLoaded = useSiteStore((state) => state.pdfLoaded);  // Check if the PDF is loaded
  const [startHoldTime, setStartHoldTime] = useState<number|null>(null);
  const [pointerIsUp, setPointerIsUp] = useState<boolean>(true);
  const [pointerDownLocation, setPointerDownLocation] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [movablePoint, setMovablePoint] = useState<Point | null>(null);


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
  const handleDoublePointerDown = (event) => { // needs to be double click
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
    
    setSelectedPoint(closestPoint);

  } else {
    setStartHoldTime(null);
    setSelectedPoint(null);
    // // If no close pin is found, add a new pin
    // const pointId = Date.now().toString();
    // const newPoint = { id: pointId, x, y, images: [], comment: '' };
    // addPoint(currentPlan.id, newPoint);  // Add the new point to the store
    // renderPoints();  // Re-render points after adding a new one
  }
};
// const timeoutId = setTimeout(() => {
//   // Code to be executed after the timeout
// }, 3000); // 3000 milliseconds = 3 seconds
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
        setMovablePoint(selectedPoint);
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
  // should be after pdf is loaded
  useLayoutEffect(() => {
    if (pdfLoaded) {

      renderPoints();
    }
  }, [renderPoints, pdfLoaded]);

  return (
    <>
      {/* Canvas for rendering pins */}
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%', 
        zIndex: 100,
        touchAction: movablePoint ? 'none' : 'auto'
      }}>
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.1"
          value={zoomLevel}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            width: 150,
            zIndex: 1000
          }}
        />
        <canvas
          ref={canvasRef}
          // @ts-ignore
          width={canvasDimensions.width}
          // @ts-ignore
          height={canvasDimensions.height}
          className="border border-black rounded-md bg-transparent inset-0 absolute z-10"
          style={{ 
            touchAction: movablePoint ? 'none' : 'auto',
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'center'
          }}
          // @ts-ignore
          onDoubleClick={handleDoublePointerDown}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerUp}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerHeldDown}
          // onDrag={handlePointerDown}
          // onDragEnd={handlePointerUp}
        />
        
        {/* Pin Popup for the selected pin - should show in middle of viewport/innerwindow*/}
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
