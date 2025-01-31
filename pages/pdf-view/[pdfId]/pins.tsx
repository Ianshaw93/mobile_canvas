import React from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';

const PinListPage = () => {
  const router = useRouter();
  const { pdfId } = router.query as { pdfId: string };
  const getPlan = useSiteStore((state) => state.getPlan);
  const plan = getPlan(pdfId);
  const points = plan?.points || [];

  const handleBack = () => {
    router.back();
  };

  const handlePinClick = (pinId: string) => {
    router.push(`/pdf-view/${pdfId}/pins/${pinId}`);
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
            <div 
              key={point.id}
              className="border-b border-gray-200 last:border-0 cursor-pointer"
              onClick={() => handlePinClick(point.id)}
            >
              <div className="p-4 hover:bg-gray-50 flex items-start space-x-4">
                <div className="w-10 h-10 flex-shrink-0 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="font-medium">{index + 1}</span>
                </div>
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
                  {/* Optional: Show image thumbnails */}
                  {point.images.length > 0 && (
                    <div className="mt-3 flex space-x-2">
                      {point.images.map((image) => (
                        <div 
                          key={image.key}
                          className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden"
                        >
                          {/* Add image component here */}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PinListPage; 