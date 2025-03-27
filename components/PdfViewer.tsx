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
    if (!pdfjs || !pdfCanvasRef.current || !plan?.url) {
      console.error('Missing required data for PDF rendering:', {
        hasPdfjs: !!pdfjs,
        hasCanvas: !!pdfCanvasRef.current,
        hasPlanUrl: !!plan?.url
      });
      return;
    }

    try {
      console.log('Starting PDF rendering process...');
      console.log('Plan details:', {
        id: plan.id,
        name: plan.name,
        urlLength: plan.url.length
      });

      const pdfData = base64ToArrayBuffer(plan.url); // Convert base64 to ArrayBuffer
      console.log('Converted PDF data to ArrayBuffer, size:', pdfData.byteLength);

      // @ts-ignore
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      console.log('PDF loaded successfully, pages:', pdf.numPages);

      // Render the first page of the PDF
      const page = await pdf.getPage(1);
      const canvas = pdfCanvasRef.current;
      const context = canvas?.getContext('2d');

      if (!context) {
        console.error('Failed to get 2D context from canvas');
        return;
      }

      const viewport = page.getViewport({ scale: 1.5 }); // Adjust the scale for larger/smaller rendering
      console.log('Viewport dimensions:', {
        width: viewport.width,
        height: viewport.height
      });

      // Set canvas dimensions to match the PDF page
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setCanvasDimensions({ width: viewport.width, height: viewport.height });

      // Render PDF page into the canvas context
      const renderContext = {
        canvasContext: context,
        viewport,
      };

      console.log('Starting PDF page render...');
      const renderTask = page.render(renderContext);
      await renderTask.promise;
      console.log('PDF page rendered successfully');

    } catch (error) {
      console.error('Error rendering PDF:', error);
    }
    setPdfLoaded(true); // Set the PDF as loaded
  };

  // Trigger the rendering when dependencies are ready
  useEffect(() => {
    if (pdfjs && pdfCanvasRef.current && plan) {
      renderPdf();
    }
  }, [pdfjs, pdfCanvasRef, plan]);

  return (
    <div id="pdf-container" style={{ height: '100%' }}>
      {/* {imageDataUrl && (
        <img
          src={imageDataUrl}
          alt="Rendered PDF Page"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }} // Ensure the image fills the canvas
        />
      )} */}
      <canvas
        ref={pdfCanvasRef}
        // style={{ display: 'none' }} // Hide the canvas, since we're rendering the image
      />
    </div>
  );
};

export default PdfViewer;
