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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 text-black overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4">
        {/* @ts-ignore */}
        <div className="bg-white p-4 grid-cols-1 align-items-center rounded-lg shadow-lg" style={popupStyle}>
          <div>
            <button onClick={() => {
              deletePoint(planId, selectedPoint.id);
              setShowPinPopup(false);
            }}>Delete Pin</button>
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