import React, { useEffect, useRef } from 'react';
import useSiteStore from '@/store/useSiteStore';
import { usePDF } from '@/hooks/usePDF';

interface PinPreviewProps {
  pdfId: string;
  point: {
    x: number;
    y: number;
    id: string;
  };
  size?: number;
  zoomLevel?: number;
  lowQuality?: boolean;
  pdfPage?: any; // Add prop for shared PDF page
}

// @ts-ignore
const PinPreview = ({ pdfId, point, size = 200, zoomLevel = 5, lowQuality = false, pdfPage = null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getPlan = useSiteStore((state) => state.getPlan);
  const plan = getPlan(pdfId);
  const pdfjs = usePDF();
  const pinImage = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!pinImage.current) {
      const img = new Image();
      img.src = '/siteright_pin.png';
      pinImage.current = img;
    }

    const renderPreview = async () => {
      if (!pdfjs || !canvasRef.current || !plan?.url) return;

      try {
        // Use provided PDF page or load new one
        const page = pdfPage || await (async () => {
          const base64Data = plan.url.split(',')[1];
          const binaryString = window.atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const pdfData = bytes.buffer;
        //  @ts-ignore
          const loadingTask = pdfjs.getDocument({ data: pdfData });
          const pdf = await loadingTask.promise;
          return pdf.getPage(1);
        })();

        // Reduce quality for list view
        const scale = lowQuality ? 0.25 : 1.5; // Even lower scale for list view
        const viewport = page.getViewport({ scale });

        const areaSize = size * zoomLevel;
        const x = Math.max(0, point.x - (areaSize/2));
        const y = Math.max(0, point.y - (areaSize/2));

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', {
          alpha: false,
          willReadFrequently: false
        });

        // Use smaller internal size for list view
        const internalSize = lowQuality ? Math.floor(size / 3) : size; // Even smaller internal size
        canvas.width = internalSize;
        canvas.height = internalSize;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;

        context?.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context!,
          viewport: viewport,
          transform: [1/zoomLevel, 0, 0, 1/zoomLevel, -x/zoomLevel, -y/zoomLevel],
          // Lower quality settings for list view
          imageSmoothing: !lowQuality,
          background: 'white'
        }).promise;

        if (context && pinImage.current) {
          const dimensionMultiplier = lowQuality ? 15 : 30; // Smaller pin for list view
          const pinWidth = dimensionMultiplier * 800/1080;
          const pinHeight = dimensionMultiplier;
          
          const pinX = (internalSize/2) - (pinWidth/2);
          const pinY = (internalSize/2) - pinHeight;
          
          context.drawImage(
            pinImage.current,
            pinX,
            pinY,
            pinWidth,
            pinHeight
          );

          if (!lowQuality) { // Only draw number for high quality view
            context.fillStyle = 'white';
            context.font = '12px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            const pointIndex = plan.points.findIndex(p => p.id === point.id);
            context.fillText(
              (pointIndex + 1).toString(),
              internalSize/2,
              internalSize/2 - pinHeight * 13/20
            );
          }
        }

      } catch (error) {
        console.error('Error rendering pin preview:', error);
      }
    };

    if (pinImage.current.complete) {
      renderPreview();
    } else {
      pinImage.current.onload = renderPreview;
    }
  }, [pdfjs, plan, point, size, zoomLevel, lowQuality, pdfPage]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{
          width: `${size}px`,
          height: `${size}px`
        }}
        className="rounded-lg shadow-md"
      />
    </div>
  );
};

export default PinPreview; 