import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';
import DownloadStateButton from '@/components/DownloadButton'; // send via api call
// import AddPlanButton from '@/components/AddPlanButton';


import PdfViewer from '@/components/PdfViewer';
import CanvasComponent from '@/components/CanvasComponent';
// import { render } from 'react-dom';

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
  const [scaleFactor, setScaleFactor] = useState(1); 
  const router = useRouter();
  // let { dataUrl, pdfId } = router.query as { dataUrl: string, pdfId: string };
  let { pdfId } = router.query as { pdfId: string };
  const setPdfLoadedState = useSiteStore((state) => state.setPdfLoaded);
  
  // const pdfjs = usePDF();
  // console.log("pdfId: ", pdfId)
  // console.log("dataUrl: ", dataUrl)
  useEffect(() => {
    // Log only after router.query is populated
    if (pdfId) {
      console.log("pdfId: ", pdfId);
      setPdfLoadedState(false)
      // console.log("dataUrl: ", dataUrl);
    }
  }, [pdfId]);  // Run this effect when `dataUrl` and `pdfId` change

  // Prevent rendering of PdfViewer and CanvasComponent until `dataUrl` and `pdfId` are available
  if (!pdfId) {
    return <div>Loading...</div>;
  }

  const handleBackClick = () => {
    router.push('/');
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ position: 'relative', 
                    flexGrow: 1,
         }}>
          <div style={{ width: '100%', height: '100%', zIndex: 0, position: 'absolute' }}>
            <PdfViewer pdfId={pdfId}/>
          </div>
          <CanvasComponent pdfId={pdfId}/>
        </div>
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'grey', zIndex:99999 }}>
          
          <button 
            onClick={handleBackClick}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-0.1 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800" 
            type="button"
          >
            Back
          </button>
          <DownloadStateButton />
          
        </div>
      </div>
    </>
  );
};

export default PdfView;
