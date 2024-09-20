import React, { useEffect, useRef } from 'react';
import useSiteStore from '@/store/useSiteStore';
import { usePDF } from '@/hooks/usePDF';


type PdfViewerProps = {
  pdfUrl: string;
};

const PdfViewer: React.FC<PdfViewerProps> = ({ pdfUrl }) => {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const setCanvasDimensions = useSiteStore((state) => state.setCanvasDimensions);  // Store canvas dimensions in Zustand
  const pdfjs = usePDF();

  const renderPdf = async (url: string) => {
    if (!pdfjs || !pdfCanvasRef.current) return;
    // @ts-ignore
    const loadingTask = pdfjs.getDocument(url);
    // @ts-ignore
    loadingTask.promise.then((pdf) => {
      const pageNumber = 1;
      // @ts-ignore
      pdf.getPage(pageNumber).then((page) => {
        const canvas = pdfCanvasRef.current;
        // @ts-ignore
        const context = canvas.getContext('2d');

        const scale = 1.5;  // Adjust scale if necessary
        const viewport = page.getViewport({ scale });

        // Set canvas dimensions based on PDF
        // @ts-ignore
        canvas.height = viewport.height;
        // @ts-ignore
        canvas.width = viewport.width;

        // Store canvas dimensions in Zustand state
        // @ts-ignore
        setCanvasDimensions({ width: canvas.width, height: canvas.height });

        const renderContext = {
          canvasContext: context,
          viewport,
        };

        const renderTask = page.render(renderContext);
        renderTask.promise.then(() => {
          console.log('PDF rendered');
        });
      });
    });
  };

  useEffect(() => {
    if (pdfUrl) {
      renderPdf(pdfUrl);
    }
  }, [pdfUrl]);

  return (
    <canvas
      ref={pdfCanvasRef}
      style={{ width: '100%', height: '100%', zIndex: 0, position: 'absolute' }}
    />
  );
};

export default PdfViewer;
