import React, { useEffect, useState } from 'react'
import CameraLogic from './CameraLogic'
import useSiteStore from '@/store/useSiteStore';
import { database } from '@/services/database';
import { Capacitor } from '@capacitor/core';

// @ts-ignore
const PinPopup = ({ setShowPinPopup, selectedPoint, planId }) => {
  const deletePoint = useSiteStore((state) => state.deletePoint);
  const updatePinStatus = useSiteStore((state) => state.updatePinStatus);
  const projects = useSiteStore((state) => state.projects);
  const selectedProjectId = useSiteStore((state) => state.selectedProjectId);
  const loadProjects = useSiteStore((state) => state.loadProjects);

  const [viewportDimensions, setViewportDimensions] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState<'Open' | 'Closed' | 'Note'>('Open');
  const [availableVisits, setAvailableVisits] = useState<number[]>([1]);
  const [pinSiteVisit, setPinSiteVisit] = useState<number>(1);
  const [isReassigning, setIsReassigning] = useState(false);

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

  // ✅ Add effect to log the selectedPoint data when popup opens
  useEffect(() => {
    console.log('🔍 PinPopup opened with selectedPoint:', selectedPoint);
    console.log('🔍 PinPopup selectedPoint.images:', selectedPoint?.images);
    console.log('🔍 PinPopup selectedPoint.comment:', selectedPoint?.comment);
  }, [selectedPoint]);

  // Sync status from selectedPoint
  useEffect(() => {
    if (selectedPoint?.status) {
      setStatus(selectedPoint.status);
    }
  }, [selectedPoint?.status]);

  // Load available site visits
  useEffect(() => {
    const loadVisits = async () => {
      if (selectedProjectId && Capacitor.isNativePlatform()) {
        try {
          const visits = await database.getAvailableSiteVisits(selectedProjectId);
          if (visits.length > 0) {
            setAvailableVisits(visits);
          }
        } catch (error) {
          console.error('Error loading available visits:', error);
        }
      }
    };
    loadVisits();
  }, [selectedProjectId]);

  // Get pin's current site visit from database
  useEffect(() => {
    const loadPinVisit = async () => {
      if (selectedPoint?.id && Capacitor.isNativePlatform()) {
        try {
          const point = await database.getPoint(selectedPoint.id);
          if (point?.site_visit_number) {
            setPinSiteVisit(point.site_visit_number);
          }
        } catch (error) {
          console.error('Error loading pin site visit:', error);
        }
      }
    };
    loadPinVisit();
  }, [selectedPoint?.id]);

  // Reassign pin to different site visit
  const handleReassignVisit = async (newVisitNumber: number) => {
    if (!selectedPoint?.id || !Capacitor.isNativePlatform()) return;

    setIsReassigning(true);
    try {
      // Reassign pin and cascade to all images
      await database.reassignPointVisit(selectedPoint.id, newVisitNumber);
      console.log(`✅ Pin ${selectedPoint.id} reassigned to Visit ${newVisitNumber}`);

      // Reload projects to refresh UI
      await loadProjects();

      // Close popup after reassignment
      setShowPinPopup(false);
    } catch (error) {
      console.error('Error reassigning pin:', error);
      alert('Failed to reassign pin. Please try again.');
    } finally {
      setIsReassigning(false);
    }
  };

  const popupStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxHeight: `${viewportDimensions.height * 0.8}px`,
    maxWidth: `${viewportDimensions.width * 0.9}px`,
    // width: '100%',
    overflowY: 'auto',
    // zIndex: 1000,
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 text-black overflow-y-auto"
      onClick={() => setShowPinPopup(false)}
    >
      <div className="min-h-screen flex items-center justify-center p-4">
        <div 
          className="bg-white p-4 grid-cols-1 align-items-center rounded-lg shadow-lg relative" 
          // @ts-ignore
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

          {/* Status Selector */}
          <div className="mt-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'Open' | 'Closed' | 'Note')}
              onBlur={() => updatePinStatus(planId, selectedPoint.id, status)}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
              <option value="Note">Note</option>
            </select>
          </div>

          {/* Site Visit Reassignment */}
          <div className="mt-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Site Visit
              <span className="ml-2 text-xs text-gray-500">(Current: Visit {pinSiteVisit})</span>
            </label>
            <div className="flex gap-2 items-center">
              <select
                value={pinSiteVisit}
                onChange={(e) => {
                  const newVisit = Number(e.target.value);
                  if (newVisit !== pinSiteVisit) {
                    if (window.confirm(`Reassign this pin to Visit ${newVisit}? This will also move all attached images.`)) {
                      handleReassignVisit(newVisit);
                    }
                  }
                }}
                disabled={isReassigning}
                className="flex-1 block border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {availableVisits.sort((a, b) => a - b).map((visit) => (
                  <option key={visit} value={visit}>
                    Visit {visit}
                  </option>
                ))}
              </select>
              {isReassigning && (
                <span className="text-sm text-gray-500">Reassigning...</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Change to reassign pin and all its images to a different site visit
            </p>
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