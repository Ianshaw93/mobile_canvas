import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '@/store/useSiteStore';
import { usePDF } from '@/hooks/usePDF';
import { Capacitor } from '@capacitor/core';
import { database } from '@/services/database';

// Helper function to calculate accurate pin positions within thumbnail container
const calculatePinPosition = (point: any, planDimensions: any, canvasDimensions: any) => {
  const containerSize = 96; // 96px × 96px container (w-24 h-24)
  
  // Pin coordinates are stored relative to canvasDimensions (1.5x scale), not plan.dimensions (1.0x)
  // Both canvas and thumbnail use the same 1.5x scale, so aspect ratios match
  const canvasAspectRatio = canvasDimensions.width / canvasDimensions.height;
  
  // Pin coordinates are stored relative to canvasDimensions (1.5x scale)
  
  let imageWidth, imageHeight, offsetX, offsetY;
  
  if (canvasAspectRatio > 1) {
    // Landscape: image fills width, letterboxed top/bottom
    imageWidth = containerSize;
    imageHeight = containerSize / canvasAspectRatio;
    offsetX = 0;
    offsetY = (containerSize - imageHeight) / 2;
  } else if (canvasAspectRatio < 1) {
    // Portrait: image fills height, pillarboxed left/right  
    imageWidth = containerSize * canvasAspectRatio;
    imageHeight = containerSize;
    offsetX = (containerSize - imageWidth) / 2;
    offsetY = 0;
  } else {
    // Square: fills entire container
    imageWidth = containerSize;
    imageHeight = containerSize;
    offsetX = 0;
    offsetY = 0;
  }
  
  // Calculate pin position within the actual image area
  // Pin coordinates are in canvasDimensions space, so scale to thumbnail container
  const pinX = offsetX + (point.x / canvasDimensions.width) * imageWidth;
  const pinY = offsetY + (point.y / canvasDimensions.height) * imageHeight;
  
  // Position calculated relative to actual image area within container
  
  return {
    left: `${pinX}px`,
    top: `${pinY}px`,
  };
};

const PinListPage = () => {
  const router = useRouter();
  const { pdfId } = router.query as { pdfId: string };
  const getPlan = useSiteStore((state) => state.getPlan);
  const canvasDimensions = useSiteStore((state) => state.canvasDimensions);
  const selectedProject = useSiteStore((state) =>
    state.projects.find(p => p.id === state.selectedProjectId)
  );
  const currentSiteVisit = selectedProject?.siteVisitNumber ?? 1;
  const plan = getPlan(pdfId);
  // Filter points by current site visit
  const points = (plan?.points || []).filter(
    (pt: any) => (pt.siteVisitNumber || pt.site_visit_number || 1) === currentSiteVisit
  );
  const pdfjs = usePDF();
  const [pdfImage, setPdfImage] = useState<string | null>(null);
  const loadProjects = useSiteStore((state) => state.loadProjects);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPinIds, setSelectedPinIds] = useState<Set<string>>(new Set());
  const [availableVisits, setAvailableVisits] = useState<number[]>([]);
  const [targetVisit, setTargetVisit] = useState<number | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  // Load available visits
  useEffect(() => {
    const loadAvailableVisits = async () => {
      if (!selectedProject?.id || !Capacitor.isNativePlatform()) return;
      try {
        const visits = await database.getAvailableSiteVisits(selectedProject.id);
        setAvailableVisits(visits);
        // Set default target to first visit that isn't current
        const otherVisit = visits.find(v => v !== currentSiteVisit);
        if (otherVisit) setTargetVisit(otherVisit);
      } catch (error) {
        console.error('Error loading available visits:', error);
      }
    };
    loadAvailableVisits();
  }, [selectedProject?.id, currentSiteVisit]);

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

  useEffect(() => {
    console.log('Plan:', plan);
    console.log('Points:', points);
  }, [plan, points]);

  const handleBack = () => {
    router.back();
  };

  const handlePinClick = (pinId: string) => {
    if (isSelectMode) {
      // In select mode, toggle selection instead of navigating
      togglePinSelection(pinId);
      return;
    }
    console.log('Navigating to pin:', pinId);
    router.push({
      pathname: `/pdf-view/${pdfId}/pins/${pinId}`,
    });
  };

  // Toggle a single pin's selection
  const togglePinSelection = (pinId: string) => {
    setSelectedPinIds(prev => {
      const next = new Set(prev);
      if (next.has(pinId)) {
        next.delete(pinId);
      } else {
        next.add(pinId);
      }
      return next;
    });
  };

  // Select all pins in current view
  const selectAllPins = () => {
    setSelectedPinIds(new Set(points.map(p => p.id)));
  };

  // Deselect all pins
  const deselectAllPins = () => {
    setSelectedPinIds(new Set());
  };

  // Toggle select mode
  const toggleSelectMode = () => {
    if (isSelectMode) {
      // Exiting select mode - clear selections
      setSelectedPinIds(new Set());
    }
    setIsSelectMode(!isSelectMode);
  };

  // Bulk reassign selected pins
  const handleBulkReassign = async () => {
    if (!targetVisit || selectedPinIds.size === 0 || !Capacitor.isNativePlatform()) return;

    const confirmed = confirm(
      `Reassign ${selectedPinIds.size} pin${selectedPinIds.size !== 1 ? 's' : ''} to Visit ${targetVisit}?`
    );
    if (!confirmed) return;

    setIsReassigning(true);
    try {
      const pointIds = Array.from(selectedPinIds);
      await database.reassignMultiplePointsVisit(pointIds, targetVisit);
      await loadProjects();
      setSelectedPinIds(new Set());
      setIsSelectMode(false);
    } catch (error) {
      console.error('Error reassigning pins:', error);
      alert('Failed to reassign pins. Please try again.');
    } finally {
      setIsReassigning(false);
    }
  };

  console.log('Pins in state:', JSON.stringify(points));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">
              Pin List {isSelectMode && `(${selectedPinIds.size} selected)`}
            </h1>
            <div className="flex items-center space-x-2">
              {points.length > 0 && (
                <button
                  onClick={toggleSelectMode}
                  className={`font-medium rounded-lg text-sm px-4 py-2 ${
                    isSelectMode
                      ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                >
                  {isSelectMode ? 'Cancel' : 'Select'}
                </button>
              )}
              <button
                onClick={handleBack}
                className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2"
              >
                Back to PDF
              </button>
            </div>
          </div>

          {/* Multi-select controls */}
          {isSelectMode && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <div className="flex flex-wrap items-center gap-2">
                {/* Select/Deselect All */}
                <button
                  onClick={selectedPinIds.size === points.length ? deselectAllPins : selectAllPins}
                  className="text-sm px-3 py-1 bg-white rounded border hover:bg-gray-50"
                >
                  {selectedPinIds.size === points.length ? 'Deselect All' : 'Select All'}
                </button>

                {/* Reassignment controls - only show when pins selected */}
                {selectedPinIds.size > 0 && availableVisits.length > 0 && (
                  <>
                    <span className="text-gray-500">|</span>
                    <span className="text-sm text-gray-600">Move to:</span>
                    <select
                      value={targetVisit || ''}
                      onChange={(e) => setTargetVisit(Number(e.target.value))}
                      className="text-sm px-2 py-1 border rounded bg-white"
                    >
                      {availableVisits
                        .filter(v => v !== currentSiteVisit)
                        .map(visit => (
                          <option key={visit} value={visit}>
                            Visit {visit}
                          </option>
                        ))}
                      {/* Option to create new visit */}
                      <option value={Math.max(...availableVisits, currentSiteVisit) + 1}>
                        New Visit ({Math.max(...availableVisits, currentSiteVisit) + 1})
                      </option>
                    </select>
                    <button
                      onClick={handleBulkReassign}
                      disabled={isReassigning || !targetVisit}
                      className="text-sm px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded disabled:bg-gray-400"
                    >
                      {isReassigning ? 'Moving...' : `Move ${selectedPinIds.size} Pin${selectedPinIds.size !== 1 ? 's' : ''}`}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pin List */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow">
          {points.map((point, index) => {
            console.log(`Point ${index + 1}:`, JSON.stringify(point));
            console.log(`Coordinates: x=${point.x}, y=${point.y}`);
            // @ts-ignore
            console.log(`Plan dimensions: width=${plan.dimensions.width}, height=${plan.dimensions.height}`);
            return (
              <button
                key={point.id}
                onClick={() => handlePinClick(point.id)}
                className={`w-full text-left border-b border-gray-200 last:border-0 hover:bg-gray-50 ${
                  isSelectMode && selectedPinIds.has(point.id) ? 'bg-blue-50' : ''
                }`}
              >
                <div className="p-4 flex items-start space-x-4">
                  {/* Checkbox when in select mode */}
                  {isSelectMode && (
                    <div className="flex-shrink-0 flex items-center justify-center w-6 h-24">
                      <input
                        type="checkbox"
                        checked={selectedPinIds.has(point.id)}
                        onChange={() => togglePinSelection(point.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  {/* Pin Preview */}
                  <div className="w-24 h-24 flex-shrink-0 relative overflow-hidden rounded-lg shadow-md">
                    {/* @ts-ignore */}
                    {plan?.thumbnail && (
                      <>
                        <div 
                          className="w-full h-full"
                          style={{
                            // @ts-ignore
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
                            // @ts-ignore
                            ...calculatePinPosition(point, plan.dimensions, canvasDimensions),
                            transform: 'translate(-50%, -50%)', // Center the pin
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
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PinListPage; 