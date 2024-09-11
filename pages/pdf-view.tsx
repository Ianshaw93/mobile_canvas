import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import PinPopup from '@/components/PinPopup';
import useSiteStore from '@/store/useSiteStore';
import DownloadStateButton from '@/components/DownloadButton';
import AddPlanButton from '@/components/AddPlanButton';

import { usePDF } from '@/hooks/usePDF';

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

const PdfView = () => {
  const [showPinPopup, setShowPinPopup] = useState<boolean>(false);
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [pdfImage, setPdfImage] = useState<string | null>(null); // State to store the Base64 image
  const [pdfLoaded, setPdfLoaded] = useState<boolean>(false);
  const [renderTask, setRenderTask] = useState<any>(null); // Track ongoing render tasks
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  let { dataUrl } = router.query as { dataUrl: string };
  const pdfjs = usePDF();

  const canvasDimensions = useSiteStore((state) => state.canvasDimensions);
  const plans = useSiteStore((state) => state.plans); // Get plans from the store
  const addPoint = useSiteStore((state) => state.addPoint); // Add points to the store

  // Find the current plan by its URL
  const currentPlan = plans.find((plan) => plan.url === dataUrl);
  const points = currentPlan?.points || []; // Use points from the current plan or default to an empty array

  // useEffect(() => {
  //   if (pdfjs && canvasRef.current && dataUrl) {
  //     renderPdf(dataUrl);
  //   }
  // }, [pdfjs, dataUrl]);

  const renderPdf = async (pdfDataUrl: string) => {
    if (!pdfjs) return;

    // Cancel the previous render task if it exists
    if (renderTask) {
      renderTask.cancel();
    }
    // Decode the base64 data from the URL and load the document using pdfjs
    // @ts-ignore
    const loadingTask = pdfjs.getDocument({ data: atob(pdfDataUrl.split(',')[1]) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1); // Render the first page

    const canvas = canvasRef.current;
    // @ts-ignore
    const context = canvas.getContext('2d');
    const viewport = page.getViewport({ scale: 1 });

    // @ts-ignore
    canvas.height = viewport.height;
    // @ts-ignore
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport,
    };

    // Initiate a new render task and store it in the state
    const task = page.render(renderContext);
    setRenderTask(task);

    await task.promise;

    // await page.render(renderContext).promise;
    // @ts-ignore
    const imageData = canvas.toDataURL('image/png');
    setPdfImage(imageData); // Set the image data in the state
    // setPdfLoaded(true);
    // renderPoints()
  }

  useEffect(() => {
    if (pdfjs && canvasRef.current && dataUrl) {
      renderPdf(dataUrl);
    }
  }, [pdfjs, dataUrl]);

  useEffect(() => {
    if (pdfImage) {
      renderPoints(); // Render points once PDF image is ready
    }
  }, [points, pdfImage]);

  // useEffect(() => {
  //   // Ensure the canvas is resized correctly when the component loads
  //   const canvas = canvasRef.current;
  //   if (canvas) {
  //     // @ts-ignore
  //     canvas.width = canvasDimensions.width / 8;
  //     // @ts-ignore
  //     canvas.height = canvasDimensions.height / 8;
  //     renderPoints(); // Render stored points on the canvas
  //   }
  // }, [canvasDimensions, points]); // Re-render when canvas dimensions or points change

  if (!dataUrl) {
    dataUrl = '';
  }

  // Calculate the distance between two points
  function calcDistance(p1: Point, p2: Point) {
    const a = p1.x - p2.x;
    const b = p1.y - p2.y;
    return Math.sqrt(a * a + b * b);
  }

  // Find the closest pin to the pointer
  function findClosestPin(pointer: Point) {
    let closestPoint: Point | null = null;
    let closestDistance: number | null = null;

    points.forEach((currentP) => {
      const currentDistance = calcDistance(pointer, currentP);
      if (
        currentDistance < 10 &&
        (closestDistance === null || currentDistance < closestDistance)
      ) {
        closestDistance = currentDistance;
        closestPoint = currentP;
      }
    });

    return closestPoint;
  }

  // Render existing points on the canvas
  function renderPoints() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
    const multiple = 6;
    points.forEach((point) => {
      context.fillStyle = 'blue';
      context.fillRect(point.x*multiple - 2.5, point.y*multiple - 2.5, 15, 15); // Render points
    });
  }

  // Handle pointer down event to add or select a pin
  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !currentPlan) return;
    const rect = canvas.getBoundingClientRect();
    console.log('Rect:', rect);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    console.log('Pointer:', x, y );
    console.log('Event:', event.pageX, event.pageY );
    // const pointer = { x: x, y: y };
    const pointer = { x: event.pageX, y: event.pageY };
    const closestPoint = findClosestPin(pointer); // add images and blank comment?

    if (closestPoint) {
      console.log('Closest point:', closestPoint);
      setSelectedPoint(closestPoint);
      setShowPinPopup(true);
    } else {
      var pointId = Date.now()
      
      const newPoint: Point = { id: `${pointId}`, x: x, y: y, images: [] as Image[], comment: '' };
      console.log("newPoint: ", newPoint)
      addPoint(currentPlan.id, newPoint); // Add the new point to the store
      renderPoints();
    }
  }
  // const addPoint = (pointer: { x: number; y: number }) => {
  //   const newPoint: Point = { id: `${Date.now()}`, x: pointer.x, y: pointer.y };
  //   setPoints([...points, newPoint]);
  // };

  const handlePinClick = (point: Point) => {
    setSelectedPoint(point);
    setShowPinPopup(true);
  };

  return (
    <>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* PDF Background */}
        {/* <div style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 0 }}>
            <iframe
              src={dataUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              title="PDF View"
            />
        </div> */}
        {/* <div style={{ position: 'relative', width: '100%',zIndex: 0, height: '100%', overflow: 'auto' }}> */}
        {pdfImage ? (
            <img
              src={pdfImage}
              alt="PDF as Image"
              style={{ position: 'absolute', zIndex: 0, width: '100%', height: '100%', 
                // transform: 'rotate(0deg)', // Rotate the image 90 degrees
                // objectFit: 'contain', 
              }}     // Ensure the image fits inside the container}}
            />
          ) : (
            <p>Loading PDF...</p>
          )}
        {/* </div> */}
        <canvas
          ref={canvasRef}
          style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%', 
            // objectFit: 'contain' 
          }}
          // @ts-ignore
          width={canvasDimensions.width}
          // @ts-ignore
          height={canvasDimensions.height}
          className="border border-black rounded-md bg-transparent inset-0 absolute z-10"
          onPointerDown={handlePointerDown}
        />


      {showPinPopup && selectedPoint && (
        <PinPopup
          setShowPinPopup={setShowPinPopup}
          selectedPoint={selectedPoint} // Pass the selected point to the popup
          planId={currentPlan?.id || ''} // Pass the plan ID to the popup
        />
      )}
      <DownloadStateButton />
      <AddPlanButton />
      </div>
    </>
  );
};

export default PdfView;
