import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';
import { usePDF } from '@/hooks/usePDF';

const PinListPage = () => {
  const router = useRouter();
  const { pdfId } = router.query as { pdfId: string };
  const getPlan = useSiteStore((state) => state.getPlan);
  const plan = getPlan(pdfId);
  const points = plan?.points || [];
  const pdfjs = usePDF();
  const [pdfImage, setPdfImage] = useState<string | null>(null);

  // Convert PDF to PNG once
  useEffect(() => {
    const convertPdfToImage = async () => {
      if (!pdfjs || !plan?.url) return;

      try {
        // Create temporary canvas for PDF rendering
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d', { alpha: false });
        
        // Load PDF
        const base64Data = plan.url.split(',')[1];
        const binaryString = window.atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const pdfData = bytes.buffer;
        // @ts-ignore
        const loadingTask = pdfjs.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        // Set canvas size to a reasonable resolution
        const viewport = page.getViewport({ scale: 0.5 }); // Lower scale for memory
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;

        // Render PDF to canvas
        await page.render({
          canvasContext: ctx!,
          viewport,
          background: 'white'
        }).promise;

        // Convert canvas to PNG
        const pngUrl = tempCanvas.toDataURL('image/png', 0.5); // Lower quality for memory
        setPdfImage(pngUrl);

        // Clean up
        tempCanvas.remove();
      } catch (error) {
        console.error('Error converting PDF to image:', error);
      }
    };

    convertPdfToImage();
  }, [pdfjs, plan]);

  const handleBack = () => {
    router.back();
  };

  const handlePinClick = (pinId: string) => {
    console.log('Navigating to pin:', pinId);
    router.push({
      pathname: `/pdf-view/${pdfId}/pins/${pinId}`,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Pin List</h1>
          <button
            onClick={handleBack}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2"
          >
            Back to PDF
          </button>
        </div>
      </div>

      {/* Pin List */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow">
          {points.map((point, index) => (
            <button 
              key={point.id}
              onClick={() => router.push(`/pdf-view/${pdfId}/pins/${point.id}`)}
              className="w-full text-left border-b border-gray-200 last:border-0 hover:bg-gray-50"
            >
              <div className="p-4 flex items-start space-x-4">
                {/* Pin Preview */}
                <div className="w-24 h-24 flex-shrink-0 relative overflow-hidden rounded-lg shadow-md">
                  {plan?.thumbnail && (
                    <>
                      <div 
                        className="w-full h-full"
                        style={{
                          backgroundImage: `url(${plan.thumbnail})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                        }}
                      />
                      <img 
                        src="/siteright_pin.png" 
                        alt="Pin"
                        className="absolute"
                        style={{ 
                          width: '12px', 
                          height: '12px',
                          left: `${(point.x / plan.dimensions.width) * 100}%`,
                          top: `${(point.y / plan.dimensions.height) * 100}%`,
                          transform: 'translate(-50%, -100%)',
                        }}
                      />
                    </>
                  )}
                </div>

                {/* Pin Number */}
                <div className="w-10 h-10 flex-shrink-0 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="font-medium">{index + 1}</span>
                </div>

                {/* Pin Details */}
                <div className="flex-grow">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">Pin {index + 1}</h3>
                      <p className="text-gray-600 mt-1">
                        {point.comment || 'No comment added'}
                      </p>
                    </div>
                    {point.images.length > 0 && (
                      <div className="flex items-center space-x-2">
                        <svg 
                          className="w-5 h-5 text-gray-400" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm text-gray-500">
                          {point.images.length} image{point.images.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PinListPage; 