import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import useSiteStore from '@/store/useSiteStore';
import { usePDF } from '@/hooks/usePDF';
import debounce from 'lodash/debounce';

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
// @ts-ignore
const PdfViewer: React.FC<PdfViewerProps> = ({ pdfId, scale }) => {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null); // State to store the Base64 image
  const pdfjs = usePDF(); // Load PDF.js
  const getPlan = useSiteStore((state) => state.getPlan); // Function to get the current plan
  const plan = getPlan(pdfId); // Get the plan using pdfId
  const setCanvasDimensions = useSiteStore((state) => state.setCanvasDimensions);
  const setPdfLoaded = useSiteStore((state) => state.setPdfLoaded);
  const [localCanvasDimensions, setLocalCanvasDimensions] = useState({ width: 0, height: 0 });

  // Memoize the render function
  const renderPdf = useCallback(async () => {
    if (!pdfjs || !pdfCanvasRef.current || !plan?.url) return;
    setPdfLoaded(false);

    try {
      const pdfData = base64ToArrayBuffer(plan.url);
      // @ts-ignore
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const canvas = pdfCanvasRef.current;
      const context = canvas?.getContext('2d');

      if (!context) return;

      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      setCanvasDimensions({ width: viewport.width, height: viewport.height });
      setLocalCanvasDimensions({ width: viewport.width, height: viewport.height });
      setPdfLoaded(true);
    } catch (error) {
      console.error('PDF render error:', error);
      setPdfLoaded(false);
    }
  }, [pdfjs, plan, scale, setCanvasDimensions, setPdfLoaded]);

  // Debounced render with cleanup
  const debouncedRender = useMemo(
    () => debounce(() => renderPdf(), 150),
    [renderPdf]
  );

  useEffect(() => {
    debouncedRender();
    return () => debouncedRender.cancel();
  }, [debouncedRender]);

  return (
    <div 
    // id="pdf-container" style={{ height: '100%' }}>
    id="pdf-container" 
    style={{ 
      height: localCanvasDimensions.height,
      width: localCanvasDimensions.width,
      position: 'relative'
    }}
    >
      <canvas
        ref={pdfCanvasRef}
      />
    </div>
  );
};

export default PdfViewer;
