import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';
import PdfViewer from '@/components/PdfViewer';
import CanvasComponent from '@/components/CanvasComponent';
import { loadPlanDisplayMode, savePlanDisplayMode, PlanDisplayMode } from '@/services/PlanDisplayPreferences';

const PdfView = () => {
  const [colorAvailable, setColorAvailable] = useState<boolean | null>(null);
  const [displayMode, setDisplayMode] = useState<PlanDisplayMode>('color');
  const [displayReady, setDisplayReady] = useState(false);
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayError, setDisplayError] = useState('');

  useEffect(() => {
    let active = true;
    loadPlanDisplayMode().then(mode => {
      if (active) {
        setDisplayMode(mode);
        setDisplayReady(true);
      }
    });
    return () => { active = false; };
  }, []);

  const changeDisplayMode = async (mode: PlanDisplayMode) => {
    setDisplayMode(mode);
    setDisplayError('');
    setSavingDisplay(true);
    try {
      await savePlanDisplayMode(mode);
    } catch {
      setDisplayError('This choice could not be saved. Please try again.');
    } finally {
      setSavingDisplay(false);
    }
  };

  const router = useRouter();
  const { pdfId } = router.query as { pdfId: string };
  const setPdfLoadedState = useSiteStore((state) => state.setPdfLoaded);

  useEffect(() => {
    if (pdfId) {
      setPdfLoadedState(false);
    }
  }, [pdfId, setPdfLoadedState]);

  const handleBackClick = () => {
    router.push('/');
  };

  const handlePinMenuClick = () => {
    router.push(`/pdf-view/${pdfId}/pins`);
  };

  const [menuOffset, setMenuOffset] = useState(0);
  const [scrollY, setScrollY] = useState(0);

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

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    // Set initial value
    setScrollY(window.scrollY);

    // Add scroll listener
    window.addEventListener('scroll', handleScroll);

    // Cleanup
    return () => window.removeEventListener('scroll', handleScroll);
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
            <PdfViewer key={pdfId} pdfId={pdfId} displayMode={displayMode} onColorAvailabilityChange={setColorAvailable} />
          </div>
          <CanvasComponent pdfId={pdfId} />
        </div>

      </div>

      {/* Fixed Bottom Menu */}
      <div 
        // className="sticky-bottom-menu"
        style={{
          position: 'absolute',
          top: `${menuOffset}px`,
          left: 0,
          width: '100%',
          height: '60px',
          backgroundColor: '#333',
          color: 'white',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          transform: `translateY(${scrollY}px)`,
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
        <button
            onClick={handlePinMenuClick}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-0.1 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
            type="button"
          >
            Pin Menu
          </button>
          <button
            onClick={handleBackClick}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-0.1 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
            type="button"
          >
            Back
          </button>

          <button type="button" aria-expanded={settingsOpen} aria-controls="plan-display-settings"
            onClick={() => setSettingsOpen(open => !open)}
            className="rounded px-4 py-2 hover:bg-gray-700 focus:ring-2 focus:ring-white">
            Settings
          </button>
          {settingsOpen && (
            <div id="plan-display-settings" className="absolute bottom-full left-0 w-full bg-gray-800 p-4 shadow-lg">
              <label htmlFor="plan-display-mode" className="mr-3">Plan display</label>
              <select id="plan-display-mode" value={displayMode}
                disabled={!displayReady || savingDisplay}
                onChange={event => changeDisplayMode(event.target.value as PlanDisplayMode)}
                className="rounded bg-gray-700 text-white px-3 py-2">
                <option value="color">Color</option>
                <option value="grayscale">Grayscale</option>
              </select>
              {colorAvailable === false && (
                <p role="status" className="mt-3 text-sm text-gray-200">
                  No color is available in this stored plan. Color mode will still show grayscale.
                  {' '}Replace the PDF with a color original to restore color.
                </p>
              )}
              {displayError && <p role="alert" className="mt-2 text-sm">{displayError}</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PdfView;
