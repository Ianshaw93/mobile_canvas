import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';
import CameraLogic from '@/components/CameraLogic';
import PinPreview from '@/components/PinPreview';

const PinDetailPage = () => {
  const router = useRouter();
  const { pdfId, pinId } = router.query as { pdfId: string; pinId: string };
  const getPlan = useSiteStore((state) => state.getPlan);
  const updatePinStatus = useSiteStore((state) => state.updatePinStatus);
  const deletePoint = useSiteStore((state) => state.deletePoint);
  const plan = getPlan(pdfId);
  const [isDeleting, setIsDeleting] = useState(false);
  const [status, setStatus] = useState<'Open' | 'Closed' | 'Note'>('Open');
  
  // ✅ This is the reference branch pattern - fresh data every render!
  const selectedPoint = plan?.points.find(point => point.id === pinId);

  // ✅ Add console logs to verify fresh data pattern
  useEffect(() => {
    console.log('🔄 Pin detail page rendered - getting fresh data from store');
    console.log('🔄 pdfId:', pdfId, 'pinId:', pinId);
    console.log('🔄 plan:', plan);
    console.log('🔄 selectedPoint (FRESH from store):', selectedPoint);
    console.log('🔄 selectedPoint.images (FRESH):', selectedPoint?.images);
    console.log('🔄 selectedPoint.comment (FRESH):', selectedPoint?.comment);
  }, [pdfId, pinId, plan, selectedPoint]);

  // Sync local status with store-selected point
  useEffect(() => {
    if (selectedPoint?.status) {
      setStatus(selectedPoint.status);
    }
  }, [selectedPoint?.status]);

  // If the pin disappears (e.g., after deletion), ensure we leave this page
  useEffect(() => {
    if (!selectedPoint && pdfId) {
      router.replace({ pathname: '/pdf-view', query: { pdfId } });
    }
  }, [selectedPoint, pdfId, router]);

  const handleBack = () => {
    router.replace(`/pdf-view/${pdfId}/pins`);
  };

  const handleDelete = () => {
    if (isDeleting) return;
    if (window.confirm('Are you sure you want to delete this pin?')) {
      setIsDeleting(true);
      // SPA navigation to PDF view like the popup flow to avoid reloading WebView
      router.replace({ pathname: '/pdf-view', query: { pdfId } });
      Promise.resolve(deletePoint(pdfId, pinId)).catch((err) => {
        console.error('❌ Error deleting point:', err);
      });
    }
  };

  if (!selectedPoint || isDeleting) {
    return null;
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
              disabled={isDeleting}
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

          {/* Status Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'Open' | 'Closed' | 'Note')}
              onBlur={() => updatePinStatus(pdfId, pinId, status)}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
              <option value="Note">Note</option>
            </select>
          </div>

          {/* Images Section */}
          <div className="mb-6">
            <h2 className="text-lg font-medium mb-2">Images</h2>
            {/* ✅ selectedPoint is always fresh from store - no stale data! */}
            <CameraLogic selectedPoint={selectedPoint} planId={pdfId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PinDetailPage; 