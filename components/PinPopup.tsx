import React, { useEffect, useState } from 'react'
import CameraLogic from './CameraLogic'
import useSiteStore from '@/store/useSiteStore';

// @ts-ignore
const PinPopup = ({ setShowPinPopup, selectedPoint, planId }) => {
  const deletePoint = useSiteStore((state) => state.deletePoint);
  const [viewportDimensions, setViewportDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateViewportDimensions = () => {
      setViewportDimensions({
        width: window.innerWidth || document.documentElement.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight
      });
    };

    updateViewportDimensions();
    window.addEventListener('resize', updateViewportDimensions);
    window.addEventListener('orientationchange', updateViewportDimensions);

    return () => {
      window.removeEventListener('resize', updateViewportDimensions);
      window.removeEventListener('orientationchange', updateViewportDimensions);
    };
  }, []);

  const popupStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxHeight: `${viewportDimensions.height * 0.8}px`,
    maxWidth: `${viewportDimensions.width * 0.9}px`,
    // width: '100%',
    // overflowY: 'auto',
    zIndex: 1000,
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 text-black overflow-y-auto"
      onClick={() => setShowPinPopup(false)}
    >
      <div className="min-h-screen flex items-center justify-center p-4">
        <div 
          className="bg-white p-4 grid-cols-1 align-items-center rounded-lg shadow-lg relative" 
          style={popupStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={() => setShowPinPopup(false)}
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div>
            <button 
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this pin?')) {
                  deletePoint(planId, selectedPoint.id);
                  setShowPinPopup(false);
                }
              }}
              className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2"
            >
              Delete Pin
            </button>
          </div>            
          <CameraLogic selectedPoint={selectedPoint} planId={planId}/>
          <div>
            <button onClick={() => setShowPinPopup(false)}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PinPopup