import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import PinPopup from '@/components/PinPopup';
import useSiteStore from '@/store/useSiteStore';
import DownloadStateButton from '@/components/DownloadButton';
import AddPlanButton from '@/components/AddPlanButton';


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
  let { dataUrl } = router.query as { dataUrl: string };
  // const pdfjs = usePDF();


  const handleBackClick = () => {
    router.push('/');
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <PdfViewer pdfUrl={dataUrl} />
        <CanvasComponent dataUrl={dataUrl}/>
        </div>
        <div style={{ textAlign: 'center', padding: '200px 0' }}>
          <button onClick={handleBackClick}>Back</button>
        </div>
      </div>
      {/* <DownloadStateButton /> */}
    </>
  );
};

export default PdfView;
