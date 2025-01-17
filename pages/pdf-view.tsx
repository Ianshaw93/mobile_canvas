import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';
import PdfViewer from '@/components/PdfViewer';
import CanvasComponent from '@/components/CanvasComponent';

const PdfView = () => {
  const router = useRouter();
  const { pdfId } = router.query as { pdfId: string };
  const setPdfLoadedState = useSiteStore((state) => state.setPdfLoaded);

  useEffect(() => {
    if (pdfId) {
      setPdfLoadedState(false);
    }
  }, [pdfId]);

  const handleBackClick = () => {
    router.push('/');
  };
  const [menuOffset, setMenuOffset] = useState(0);

  // Function to update menu offset based on viewport height
  const updateMenuOffset = () => {
    const viewportHeight = window.innerHeight;
    setMenuOffset(viewportHeight - 60); // Adjust 60px for the menu height
  };

  useEffect(() => {
    // const updateMenuPosition = () => {
    //   // Reapply fixed positioning or any adjustments needed on resize
    //   const menu = document.querySelector('.bottom-menu-overlay');
    //   if (menu) {
    //     menu.style.bottom = '0';
    //   }
    // };
    updateMenuOffset();
    // Listen for resize and orientation change
    window.addEventListener('resize', updateMenuOffset);
    window.addEventListener('orientationchange', updateMenuOffset);

    return () => {
      window.removeEventListener('resize', updateMenuOffset);
      window.removeEventListener('orientationchange', updateMenuOffset);
    };
  }, []);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ position: 'relative', 
          // flexGrow: 1
          overflowY: 'scroll',
          height: 'calc(100vh - 60px)',

          }}>
          <div style={{ width: '100%', height: '100%', zIndex: 0, position: 'absolute' }}>
            <PdfViewer pdfId={pdfId} />
          </div>
          <CanvasComponent pdfId={pdfId} />
        </div>
        <div style={{ 
                      textAlign: 'center', 
                      padding: '20px 0', 
                      color: 'grey', 
                      zIndex: 9999,
                      userSelect: 'none',
                      touchAction: 'none', 

        }}>
          <button
            onClick={handleBackClick}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-0.1 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
            type="button"
          >
            Back
          </button>
        </div>
      </div>

      {/* Fixed Bottom Menu */}
      <div 
        // className="sticky-bottom-menu"
        style={{
          position: 'absolute',
          top: `${menuOffset}px`, // Dynamic offset based on viewport height
          left: 0,
          width: '100%',
          height: '60px',
          backgroundColor: '#333',
          color: 'white',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          transform: `translateY(${window.scrollY}px)`, // Follow scroll position
          userSelect: 'none',
          touchAction: 'none',
        }}
          
      >
        {/* SVG Decoration */}
        <svg
          className="w-full h-4 absolute top-[-16px]"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 320"
          style={{ zIndex: -1 }}
        >
          <polygon points="0 0 1440 0 1440 120" className="fill-current text-gray-900" />
          <polygon points="1440 0 0 0 0 120" className="fill-current text-gray-800" />
        </svg>
        
        {/* Menu Content */}
        <div className="flex justify-center items-center w-full py-4 z-10">
          <span>Hey</span>
        </div>
      </div>
    </>
  );
};

export default PdfView;
