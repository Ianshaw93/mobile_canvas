import React, { useEffect, useRef, useState } from 'react';
import useSiteStore from '@/store/useSiteStore';
import { usePDF } from '@/hooks/usePDF';

type PdfViewerProps = {
  pdfId: string;
};

// Utility function to convert Base64 to ArrayBuffer
const base64ToArrayBuffer = (base64: string) => {
  const base64Data = base64.split(',')[1]; // Remove the metadata if it exists
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer; // Return ArrayBuffer
};

const PdfViewer: React.FC<PdfViewerProps> = ({ pdfId }) => {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null); // State to store the Base64 image
  const pdfjs = usePDF(); // Load PDF.js
  const getPlan = useSiteStore((state) => state.getPlan); // Function to get the current plan
  const plan = getPlan(pdfId); // Get the plan using pdfId
  const setCanvasDimensions = useSiteStore((state) => state.setCanvasDimensions);
  const setPdfLoaded = useSiteStore((state) => state.setPdfLoaded);

  // Render the PDF onto the canvas
  const renderPdf = async () => {
    if (!pdfjs || !pdfCanvasRef.current || !plan?.url) return;

    const pdfData = base64ToArrayBuffer(plan.url); // Convert base64 to ArrayBuffer
    try {
      // @ts-ignore
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;

      // Render the first page of the PDF
      const page = await pdf.getPage(1);
      const canvas = pdfCanvasRef.current;
      const context = canvas?.getContext('2d');

      if (!context) {
        console.error('Failed to get 2D context from canvas');
        return;
      }

      const viewport = page.getViewport({ scale: 1.5 }); // Adjust the scale for larger/smaller rendering

      // Set canvas dimensions to match the PDF page
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setCanvasDimensions({ width: viewport.width, height: viewport.height });
      // Render PDF page into the canvas context
      const renderContext = {
        canvasContext: context,
        viewport,
      };

      const renderTask = page.render(renderContext);
      await renderTask.promise;

      // // Convert the rendered PDF on the canvas to an image URL
      // const imageUrl = canvas.toDataURL('image/png');
      // setImageDataUrl(imageUrl); // Save the image URL in the state
      // console.log('PDF rendered and converted to image');
    } catch (error) {
      console.error('Error rendering PDF:', error);
    }
    setPdfLoaded(true); // Set the PDF as loaded
  };

  // Trigger the rendering when dependencies are ready
  useEffect(() => {
    if (pdfjs && pdfCanvasRef.current && plan && !imageDataUrl) {
      renderPdf();
    }
  }, [pdfjs, pdfCanvasRef.current, plan?.url]); // Only re-render if the PDF URL changes

  return (
    <div id="pdf-container" style={{
      width: plan?.dimensions?.width,
      height: plan?.dimensions?.height,
      position: 'relative',
      margin: '0 auto'
    }}>
      {/* {imageDataUrl && (
        <img
          src={imageDataUrl}
          alt="Rendered PDF Page"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }} // Ensure the image fills the canvas
        />
      )} */}
      <canvas
        ref={pdfCanvasRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1
        }}
      />
    </div>
  );
};

export default PdfViewer;
