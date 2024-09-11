import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '../store/useSiteStore';
import { usePDF } from '../hooks/usePDF';

type Dimensions = {
  width: number;
  height: number;
};

// Helper function to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const PdfPicker = () => {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewImage, setPreviewImage] = useState<boolean>(false);
  const setCanvasDimensions = useSiteStore((state) => state.setCanvasDimensions);
  const addPlan = useSiteStore((state) => state.addPlan);
  const plans = useSiteStore((state) => state.plans);
  const router = useRouter();
  const pdfjs = usePDF();
  const [mounted, setMounted] = useState(false); // Track if the component is mounted
  console.log("plans: ", plans)

  useEffect(() => {
    setMounted(true); // Set to true once component is mounted
  }, []);

  if (!mounted) {
    // Render nothing on the server and until the client mounts
    return null;
  }
  // Handle file upload and rendering to canvas
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file && pdfCanvasRef.current) {
      const base64PDF = await blobToBase64(file); // Convert Blob to Base64

      // @ts-ignore
      const loadingTask = pdfjs.getDocument(URL.createObjectURL(file));
      loadingTask.promise.then((pdf: any) => {
        const pageNumber = 1;
        pdf.getPage(pageNumber).then((page: any) => {
          const canvas = pdfCanvasRef.current;
          const context = canvas?.getContext('2d');
          const scale = 1;
          const viewport = page.getViewport({ scale });

          if (canvas) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            setCanvasDimensions({ width: canvas.width, height: canvas.height });

            // Render PDF page into canvas
            const renderContext = {
              canvasContext: context,
              viewport,
            };
            const renderTask = page.render(renderContext);
            renderTask.promise.then(() => {
              const thumbnail = canvas.toDataURL(); // Save thumbnail

              // Create a new plan object with the Base64 URL instead of Blob URL
              const newPlan = {
                id: `${Date.now()}`, // Unique ID
                url: base64PDF, // Store the Base64 string instead of a Blob URL
                thumbnail, // Thumbnail for preview
                dimensions: { width: canvas.width, height: canvas.height },
                points: [],
                images: [],
              };

              addPlan(newPlan); // Add plan to the store
              setPreviewImage(true);
            });
          }
        });
      });
    }
  };

  // Navigate to the PDF view
  const viewPdf = (planUrl: string) => {
    router.push({
      pathname: '/pdf-view',
      query: { dataUrl: planUrl },
    });
  };

  return (
    <>
      <div>
        <label>
          <input
            id="image"
            name="image"
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
          />
        </label>
      </div>

      <canvas ref={pdfCanvasRef} className="hidden" />

      <div>
        {plans.map((plan, index) => (
          <div key={index} className="mb-4">
            <p>{`PDF ${index + 1}`}</p>
            <img
              // @ts-ignore
              src={plan.thumbnail}
              alt={`PDF ${index + 1}`}
              onClick={() => viewPdf(plan.url)}
              className="max-w-sm cursor-pointer"
            />
          </div>
        ))}
      </div>
    </>
  );
};

export default PdfPicker;
