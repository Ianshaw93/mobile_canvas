import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';
import CameraLogic from '@/components/CameraLogic';

const PinPopupPage = () => {
  const router = useRouter();
  const { pointId, pdfId: planId } = router.query as { pointId: string; pdfId: string }; // Get both IDs
  const { getPoint, deletePoint } = useSiteStore();
  const [selectedPoint, setSelectedPoint] = useState(null);

  useEffect(() => {
    // Wait until the router is ready and query params are loaded
    if (router.isReady && planId && pointId) {
      console.log('Fetching point data for planId:', planId, 'pointId:', pointId); // Debugging output
      const point = getPoint(planId, pointId); // Fetch the point data
      setSelectedPoint(point);
      console.log('Selected point:', point); // Debugging output
    }
  }, [router.isReady, planId, pointId]);

  if (!selectedPoint) return <div>Loading...</div>;

  const handleDelete = () => {
    deletePoint(planId, pointId);
    router.back();
  };

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-4 text-black">
      <div className="w-full max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg text-center">
        <h3 className="text-xl font-bold mb-4">Pin Details</h3>
        <CameraLogic selectedPoint={selectedPoint} planId={planId} />
        <button
          className="mt-4 text-red-600 hover:text-red-800 font-medium"
          onClick={handleDelete}
        >
          Delete Pin
        </button>
        <button
          className="mt-4 text-blue-600 hover:text-blue-800 font-medium"
          onClick={() => router.back()}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default PinPopupPage;
