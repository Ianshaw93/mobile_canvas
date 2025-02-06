import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';
import CameraLogic from '@/components/CameraLogic';
import PinPreview from '@/components/PinPreview';

const PinDetailPage = () => {
  const router = useRouter();
  const { pdfId, pinId } = router.query as { pdfId: string; pinId: string };
  const getPlan = useSiteStore((state) => state.getPlan);
  const deletePoint = useSiteStore((state) => state.deletePoint);
  const plan = getPlan(pdfId);
  const selectedPoint = plan?.points.find(point => point.id === pinId);

  const handleBack = () => {
    router.back();
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this pin?')) {
      deletePoint(pdfId, pinId);
      router.back();
    }
  };

  if (!selectedPoint) {
    return <div>Pin not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Pin Details</h1>
          <div className="space-x-2">
            <button
              onClick={handleDelete}
              className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2"
            >
              Delete Pin
            </button>
            <button
              onClick={handleBack}
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2"
            >
              Back to List
            </button>
          </div>
        </div>
      </div>

      {/* Pin Details */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          {/* Pin Location Preview */}
          <div className="mb-6">
            <h2 className="text-lg font-medium mb-2">Pin Location</h2>
            <PinPreview 
              pdfId={pdfId} 
              point={selectedPoint} 
              size={300}
              zoomLevel={2}
            />
          </div>

          {/* Images Section */}
          <div className="mb-6">
            <h2 className="text-lg font-medium mb-2">Images</h2>
            <CameraLogic selectedPoint={selectedPoint} planId={pdfId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PinDetailPage; 