import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '../store/useSiteStore';
import { usePDF } from '../hooks/usePDF';
// import {downloadProject, loginToDropbox} from './ApiCalls';
// import BackupButton from './BackupButton';
import { getFirstPlanIdOrDatetime } from './ReturnProjectId';
import { Filesystem, Directory } from '@capacitor/filesystem';
import ReportButton from './ReportButton';
import { sendProjectToBackend } from './ApiCalls';
import DownloadProjectButton from './DownloadProjectButton';
import ImportProjectButton from './ImportProjectButton';
import SupportBundleButton from './SupportBundleButton';
import SyncButton from './SyncButton';
import { convertPdfToGrayscale, grayscaleCanvasInPlace } from '@/utils/pdfGrayscale';
import { database } from '@/services/database';

type Dimensions = {
  width: number;
  height: number;
};


// Helper function to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Add this before trying to write files
async function requestPermissions() {
  try {
    // Test write permissions by attempting to write a test file
    await Filesystem.writeFile({
      path: 'test.txt',
      data: 'test',
      directory: Directory.Documents
    });
    return true;
  } catch (err) {
    console.error('Error checking permissions:', err);
    return false;
  }
}

const PdfPicker = () => {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewImage, setPreviewImage] = useState<boolean>(false);
  const setCanvasDimensions = useSiteStore((state) => state.setCanvasDimensions);
  const addPlan = useSiteStore((state) => state.addPlan);
  const addCanvasRef = useSiteStore((state) => state.addCanvasRef);
  const selectedProjectId = useSiteStore((state) => state.selectedProjectId);
  const selectedProject = useSiteStore((state) =>
    state.projects.find(p => p.id === state.selectedProjectId)
  );
  const currentSiteVisit = selectedProject?.siteVisitNumber ?? 1;
  // Plans are shared across all visits - no filtering here
  // Only PINS are filtered by site visit (handled in plan view components)
  const plans = selectedProject?.plans || [];
  const [availableVisits, setAvailableVisits] = useState<number[]>([currentSiteVisit]);
  const addToOfflineQueue = useSiteStore((state) => state.addToOfflineQueue);
  const router = useRouter();
  const pdfjs = usePDF();
  const [mounted, setMounted] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newClientName, setNewClientName] = useState<string>('');
  const [newSiteVisitNumber, setNewSiteVisitNumber] = useState<string>('1');
  const [newEngineerName, setNewEngineerName] = useState<string>('');
  const addProject = useSiteStore((state) => state.addProject);
  const updateProject = useSiteStore((state) => state.updateProject);
  const setSelectedProjectId = useSiteStore((state) => state.setSelectedProjectId);
  const projects = useSiteStore((state) => state.projects);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const updatePlanName = useSiteStore((state) => state.updatePlanName);
  const movePlanUp = useSiteStore((state) => state.movePlanUp);
  const movePlanDown = useSiteStore((state) => state.movePlanDown);
  const deletePlan = useSiteStore((state) => state.deletePlan);

  const [managementMode, setManagementMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [movingPlanId, setMovingPlanId] = useState<string | null>(null);
  const [namePromptOpen, setNamePromptOpen] = useState<boolean>(false);
  const [proposedPlanName, setProposedPlanName] = useState<string>('');
  const [pendingPlanData, setPendingPlanData] = useState<null | {
    planId: string;
    grayscalePDF: string;
    thumbnail: string;
    width: number;
    height: number;
    displayScale: number;
    projectId: string;
  }>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync editable fields with selected project metadata
  useEffect(() => {
    if (selectedProject) {
      setNewClientName(selectedProject.clientName || '');
      setNewSiteVisitNumber(String(selectedProject.siteVisitNumber ?? 1));
      setNewEngineerName(selectedProject.engineerName || '');
    }
  }, [selectedProject?.id]);

  // Add useEffect to handle automatic project selection
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      // If there's only one project or no selection yet, select the first project
      if (projects.length === 1) {
        setSelectedProjectId(projects[0].id);
      } else {
        // Try to get last selected project from localStorage
        const lastSelectedProject = localStorage.getItem('lastSelectedProject');
        if (lastSelectedProject && projects.find(p => p.id === lastSelectedProject)) {
          setSelectedProjectId(lastSelectedProject);
        }
      }
    }
  }, [projects, selectedProjectId, setSelectedProjectId]);

  // Update localStorage when project selection changes
  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('lastSelectedProject', selectedProjectId);
    }
  }, [selectedProjectId]);

  // Load available site visits for current project
  useEffect(() => {
    const loadAvailableVisits = async () => {
      if (selectedProjectId) {
        try {
          const visits = await database.getAvailableSiteVisits(selectedProjectId);
          if (visits.length > 0) {
            setAvailableVisits(visits);
          } else {
            // If no visits found, default to current visit
            setAvailableVisits([currentSiteVisit]);
          }
        } catch (error) {
          console.error('Error loading available visits:', error);
          setAvailableVisits([currentSiteVisit]);
        }
      }
    };
    loadAvailableVisits();
  }, [selectedProjectId, currentSiteVisit]);

  if (!mounted) {
    return null;
  }

  // Handle file upload and rendering to canvas
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file && pdfCanvasRef.current) {
      // Save the original PDF data without modification
      const base64PDF = await blobToBase64(file);
      // Convert to grayscale PDF for storage/display/export
      let grayscalePDF = base64PDF;
      try {
        grayscalePDF = await convertPdfToGrayscale(base64PDF);
      } catch (e) {
        console.warn('Grayscale conversion failed, storing original PDF:', e);
      }
      const projectId = selectedProjectId;
      const planId = `${Date.now()}`;
      
      if (!projectId) {
        console.error('No project selected');
        return;
      }

      // Get current number of plans to determine the index
      const currentPlans = selectedProject?.plans || [];
      const newIndex = currentPlans.length;

      console.log("projectId: ", projectId, "planId: ", planId, file.name);
      addToOfflineQueue({
        file,
        projectId,
        planId
      });
      
      try {
        // Load the PDF to get its original dimensions
        // @ts-ignore
        const loadingTask = pdfjs.getDocument(URL.createObjectURL(file));
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        // Get the original viewport at scale 1.0
        const originalViewport = page.getViewport({ scale: 1.0 });
        
        const canvas = pdfCanvasRef.current;
        const context = canvas?.getContext('2d');
        const displayScale = 1.5; // Scale for display thumbnail
        const viewport = page.getViewport({ scale: displayScale });

        if (canvas) {
          // Set canvas dimensions for thumbnail
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          setCanvasDimensions({ width: canvas.width, height: canvas.height });

          // Render PDF page into canvas for thumbnail
          const renderContext = {
            canvasContext: context,
            viewport,
          };
          const renderTask = page.render(renderContext);
          await renderTask.promise;
          // Ensure thumbnail appears grayscale too
          grayscaleCanvasInPlace(canvas);
          const thumbnail = canvas.toDataURL();

          // Stash data and prompt for a name (blank by default)
          setPendingPlanData({
            planId,
            grayscalePDF,
            thumbnail,
            width: originalViewport.width,
            height: originalViewport.height,
            displayScale,
            projectId
          });
          setProposedPlanName('');
          setNamePromptOpen(true);
        }
      } catch (error) {
        console.error('Error processing PDF:', error);
      }
    }
  };

  // Confirm adding plan after validating name
  const confirmAddPlanWithName = async () => {
    if (!pendingPlanData || !selectedProjectId) return;
    const trimmed = proposedPlanName.trim();
    if (!trimmed) return;
    const nameExists = plans.some(p => (p.name || '').trim().toLowerCase() === trimmed.toLowerCase());
    if (nameExists) return;

    const newPlan = {
      id: pendingPlanData.planId,
      name: trimmed,
      url: pendingPlanData.grayscalePDF,
      thumbnail: pendingPlanData.thumbnail,
      dimensions: {
        width: pendingPlanData.width,
        height: pendingPlanData.height,
        displayScale: pendingPlanData.displayScale
      },
      points: [],
      images: [],
      planId: pendingPlanData.planId,
      projectId: pendingPlanData.projectId
    };

    addCanvasRef(newPlan.id, pdfCanvasRef.current, pendingPlanData.grayscalePDF);
    await addPlan(selectedProjectId, newPlan);
    setPreviewImage(true);

    // Cleanup and close
    setPendingPlanData(null);
    setProposedPlanName('');
    setNamePromptOpen(false);
  };

  const cancelAddPlan = () => {
    setPendingPlanData(null);
    setProposedPlanName('');
    setNamePromptOpen(false);
  };

  // Navigate to the PDF view
  const viewPdf = (planUrl: string, planId: string) => {
    console.log("planId: ", planId) 
    router.push({
      pathname: '/pdf-view',
      query: { 
        pdfId: planId
      },
    });
  };

  const handleNameUpdate = (planId: string) => {
    if (editingName.trim() && selectedProjectId) {
      updatePlanName(selectedProjectId, planId, editingName.trim());
      setEditingPlanId(null);
      setEditingName('');
    }
  };

  const handleMovePlanUp = async (planId: string) => {
    if (selectedProjectId) {
      try {
        setMovingPlanId(planId); // Show loading state
        await movePlanUp(selectedProjectId, planId);
      } catch (error) {
        console.error('Error moving plan up:', error);
      } finally {
        setMovingPlanId(null); // Clear loading state
      }
    }
  };

  const handleMovePlanDown = async (planId: string) => {
    if (selectedProjectId) {
      try {
        setMovingPlanId(planId); // Show loading state
        await movePlanDown(selectedProjectId, planId);
      } catch (error) {
        console.error('Error moving plan down:', error);
      } finally {
        setMovingPlanId(null); // Clear loading state
      }
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (selectedProjectId) {
      try {
        await deletePlan(selectedProjectId, planId);
        setShowDeleteConfirm(null);
        setManagementMode(false);
      } catch (error) {
        console.error('Error deleting plan:', error);
      }
    }
  };

  const toggleManagementMode = () => {
    setManagementMode(!managementMode);
    // Exit editing mode when toggling management
    setEditingPlanId(null);
    setEditingName('');
  };

  return (
    <>
      {/* Project Selection */}
      <div className="mb-4">
        <select 
          value={selectedProjectId || ''} 
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          className="mr-2 p-2 border rounded text-black"
          aria-label="Select Project"
        >
          <option value="">Select a Project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <div className="inline-flex">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="New Project Name"
            className="p-2 border rounded mr-2 text-black"
            aria-label="New Project Name"
          />
          <button
            onClick={async () => {
              if (newProjectName.trim()) {
                const id = await addProject({
                  name: newProjectName.trim(),
                  clientName: '',
                  siteVisitNumber: 1,
                  engineerName: ''
                });
                setNewProjectName('');
                setSelectedProjectId(id);
              }
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 focus:ring-2 focus:ring-blue-300"
          >
            Add Project
          </button>
        </div>
      </div>

      {/* Selected Project Details */}
      {selectedProject && (
        <div className="mb-4 p-3 border rounded bg-white/50">
          <div className="font-semibold mb-2">Project Details</div>
          <div className="flex flex-col gap-2">
            <label className="text-sm">Client Name</label>
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onBlur={() => updateProject(selectedProject.id, { clientName: newClientName.trim() })}
              className="p-2 border rounded text-black w-60"
              aria-label="Client Name (selected project)"
            />

            <label className="text-sm">Project Name</label>
            <input
              type="text"
              value={selectedProject.name}
              onChange={(e) => updateProject(selectedProject.id, { name: e.target.value })}
              className="p-2 border rounded text-black w-60"
              aria-label="Project Name (selected project)"
            />

            <label className="text-sm">Site Visit</label>

            {/* Currently Viewing Indicator */}
            <div className="mb-2 px-3 py-2 bg-blue-100 border border-blue-300 rounded text-blue-800 font-semibold">
              📍 Currently viewing: Visit {currentSiteVisit}
            </div>

            {/* Site Visit Switcher Buttons */}
            <div className="flex flex-wrap gap-2 items-center">
              {availableVisits.sort((a, b) => a - b).map((visit) => (
                <button
                  key={visit}
                  onClick={() => {
                    setNewSiteVisitNumber(String(visit));
                    updateProject(selectedProject.id, { siteVisitNumber: visit });
                  }}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    visit === currentSiteVisit
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  aria-label={`Switch to Visit ${visit}`}
                >
                  Visit {visit}
                </button>
              ))}

              {/* New Visit Button */}
              <button
                onClick={() => {
                  const nextVisit = Math.max(...availableVisits, 0) + 1;
                  setNewSiteVisitNumber(String(nextVisit));
                  updateProject(selectedProject.id, { siteVisitNumber: nextVisit });
                  setAvailableVisits([...availableVisits, nextVisit]);
                }}
                className="px-4 py-2 rounded font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                aria-label="Create New Visit"
              >
                + New Visit
              </button>
            </div>

            <label className="text-sm">Engineer Name</label>
            <select
              value={newEngineerName}
              onChange={(e) => {
                setNewEngineerName(e.target.value);
                updateProject(selectedProject.id, { engineerName: e.target.value });
              }}
              className="p-2 border rounded text-black w-60"
              aria-label="Engineer Name (selected project)"
            >
              <option value="">Select engineer</option>
              <option value="Joana Kruk">Joana Kruk</option>
              <option value="Sam Bennett">Sam Bennett</option>
              <option value="Thomas O&apos;Driscoll">Thomas O&apos;Driscoll</option>
              <option value="Diana Prostire">Diana Prostire</option>
              <option value="Eoghan O’Meara">Eoghan O’Meara</option>
              <option value="Kevin Kurniawan">Kevin Kurniawan</option>
              <option value="Kirsty Cameron">Kirsty Cameron</option>
            </select>
          </div>

          {/* Danger zone */}
          <div className="mt-4 border-t pt-3">
            <button
              onClick={async () => {
                if (!selectedProjectId) return;
                const ok = typeof window === 'undefined' ? false : window.confirm(
                  `Delete project "${selectedProject?.name}"? This will permanently remove all plans, pins and images. This cannot be undone.`
                );
                if (!ok) return;
                try {
                  await useSiteStore.getState().deleteProject(selectedProjectId);
                  setSelectedProjectId(null);
                  setNewClientName('');
                  setNewSiteVisitNumber('1');
                  setNewEngineerName('');
                } catch (e) {
                  console.error('Failed to delete project', e);
                }
              }}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Delete Project
            </button>
          </div>
        </div>
      )}

      {/* Add a visual cue when project is selected */}
      {selectedProjectId && (
        <div className="mt-2 mb-4 space-y-2">
          <div className="text-green-600 animate-pulse mb-2">
            ↓ Add PDFs to your project here ↓
          </div>
          <div className="flex gap-2">
            <DownloadProjectButton projectId={selectedProjectId} />
            <ImportProjectButton />
          </div>
          <div className="mt-2 p-3 border rounded bg-gray-50">
            <div className="text-sm font-medium text-gray-700 mb-2">Sync to Server</div>
            <SyncButton projectId={selectedProjectId} />
          </div>
          <SupportBundleButton />
        </div>
      )}

      {/* Only show file upload if a project is selected */}
      {selectedProjectId ? (
        <div>
          <label className="block mb-4">
            <span className="sr-only">Choose PDF file</span>
            <input
              id="pdf-upload"
              name="pdf-upload"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
              aria-label="Upload PDF"
            />
          </label>
        </div>
      ) : (
        <p className="text-gray-500">Please select or create a project first</p>
      )}

      <canvas ref={pdfCanvasRef} className="hidden" />

      {/* One-time migration: convert existing plan PDFs to grayscale */}
      {mounted && (
        <MigrationRunner projects={projects} />
      )}

      {/* Management Mode Header */}
      {managementMode && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex justify-between items-center">
            <p className="text-blue-800 font-medium">Management Mode: Reorder and manage your plans</p>
            <button
              onClick={toggleManagementMode}
              className="text-blue-600 hover:text-blue-800"
              aria-label="Exit Management Mode"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div>
        {plans.map((plan, index) => (
          <div key={plan.id} className="mb-4">
            {editingPlanId === plan.id ? (
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="p-2 border rounded text-black"
                  placeholder="Enter new name"
                  autoFocus
                />
                <button
                  onClick={() => handleNameUpdate(plan.id)}
                  className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingPlanId(null);
                    setEditingName('');
                  }}
                  className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-2">
                {managementMode && (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleMovePlanUp(plan.id)}
                      disabled={index === 0 || movingPlanId === plan.id}
                      className={`px-2 py-1 text-sm rounded ${
                        index === 0 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : movingPlanId === plan.id
                          ? 'bg-yellow-500 text-white animate-pulse cursor-not-allowed'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                      aria-label="Move Plan Up"
                    >
                      {movingPlanId === plan.id ? '⏳' : '↑'}
                    </button>
                    <button
                      onClick={() => handleMovePlanDown(plan.id)}
                      disabled={index === plans.length - 1 || movingPlanId === plan.id}
                      className={`px-2 py-1 text-sm rounded ${
                        index === plans.length - 1
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : movingPlanId === plan.id
                          ? 'bg-yellow-500 text-white animate-pulse cursor-not-allowed'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                      aria-label="Move Plan Down"
                    >
                      {movingPlanId === plan.id ? '⏳' : '↓'}
                    </button>
                  </div>
                )}
                <p className="flex-grow">{plan.name}</p>
                {managementMode ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingPlanId(plan.id);
                        setEditingName(plan.name || '');
                      }}
                      className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(plan.id)}
                      className="px-2 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                      aria-label="Delete Plan"
                    >
                      🗑️
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={toggleManagementMode}
                    className="px-2 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                    aria-label="Manage Plans"
                  >
                    🔧
                  </button>
                )}
              </div>
            )}
            <div
              onClick={() => viewPdf(plan.url, plan.id)}
              className="relative inline-block max-w-sm cursor-pointer"
            >
              <img
                src={plan.thumbnail}
                alt={plan.name}
                className="block w-full h-auto"
              />
              {(plan?.points || [])
                .filter((pt: any) => (pt.siteVisitNumber || pt.site_visit_number || 1) === currentSiteVisit)
                .map((pt: any) => {
                const displayScale = plan?.dimensions?.displayScale || 1.5;
                const baseWidth = plan?.dimensions?.width || 1;
                const baseHeight = plan?.dimensions?.height || 1;
                const leftPct = (pt.x / (baseWidth * displayScale)) * 100;
                const topPct = (pt.y / (baseHeight * displayScale)) * 100;
                return (
                  <span
                    key={pt.id}
                    className="absolute rounded-full bg-blue-500 border-2 border-white"
                    style={{
                      width: 8,
                      height: 8,
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>


      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4 text-red-600">⚠️ Delete Plan</h3>
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete this plan? This will also delete all pins and images associated with this plan.
            </p>
            <p className="text-sm text-red-600 mb-6">This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showDeleteConfirm) {
                    handleDeletePlan(showDeleteConfirm);
                  }
                }}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Name Prompt Modal */}
      {namePromptOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Name your plan</h3>
            <div className="mb-4">
              <input
                type="text"
                value={proposedPlanName}
                onChange={(e) => setProposedPlanName(e.target.value)}
                className="p-2 border rounded text-black w-full"
                placeholder="Enter a unique name"
                aria-label="Plan name"
                autoFocus
              />
              {proposedPlanName.trim().length === 0 && (
                <p className="text-sm text-gray-500 mt-1">Name must have at least 1 character.</p>
              )}
              {proposedPlanName.trim().length > 0 && plans.some(p => (p.name || '').trim().toLowerCase() === proposedPlanName.trim().toLowerCase()) && (
                <p className="text-sm text-red-600 mt-1">A plan with this name already exists in this project.</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelAddPlan}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddPlanWithName}
                disabled={
                  proposedPlanName.trim().length === 0 ||
                  plans.some(p => (p.name || '').trim().toLowerCase() === proposedPlanName.trim().toLowerCase())
                }
                className={`px-4 py-2 rounded text-white ${
                  proposedPlanName.trim().length === 0 ||
                  plans.some(p => (p.name || '').trim().toLowerCase() === proposedPlanName.trim().toLowerCase())
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PdfPicker;

// Background component to run one-time migration of existing PDFs to grayscale
const MigrationRunner: React.FC<{ projects: any[] }> = ({ projects }) => {
  useEffect(() => {
    const flagKey = 'grayscale_migration_v2_done';
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(flagKey)) return;

    const run = async () => {
      try {
        // Lazy import pdf.js for thumbnail generation
        // @ts-ignore
        const pdfjs = await import('pdfjs-dist/build/pdf');
        // @ts-ignore
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

        const renderGrayThumbnail = async (pdfDataUrlOrBase64: string) => {
          // Accept data URL or raw base64
          const base64 = pdfDataUrlOrBase64.includes(',')
            ? pdfDataUrlOrBase64.split(',')[1]
            : pdfDataUrlOrBase64;
          const bin = typeof atob === 'function' ? atob(base64) : '';
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          // @ts-ignore
          const loadingTask = pdfjs.getDocument({ data: bytes.buffer });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { alpha: false });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
          grayscaleCanvasInPlace(canvas);
          return canvas.toDataURL();
        };

        for (const project of projects || []) {
          for (const plan of (project?.plans || [])) {
            if (typeof plan?.url === 'string') {
              try {
                const grayUrl = await convertPdfToGrayscale(plan.url);
                const newThumb = await renderGrayThumbnail(grayUrl);
                if (grayUrl && grayUrl !== plan.url) {
                  await database.updatePlan(plan.id, { url: grayUrl, thumbnail: newThumb });
                } else if (newThumb && newThumb !== plan.thumbnail) {
                  await database.updatePlan(plan.id, { thumbnail: newThumb });
                }
              } catch (e) {
                console.warn('Failed to grayscale plan', plan?.id, e);
              }
            }
          }
        }
        await useSiteStore.getState().loadProjects();
        localStorage.setItem(flagKey, '1');
      } catch (e) {
        console.error('Grayscale migration failed:', e);
      }
    };

    // Defer to allow initial UI render
    setTimeout(run, 0);
  }, [projects]);

  return null;
};

