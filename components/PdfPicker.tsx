import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '../store/useSiteStore';
import { usePDF } from '../hooks/usePDF';
import {downloadProject, loginToDropbox} from './ApiCalls';
import BackupButton from './BackupButton';
import { getFirstPlanIdOrDatetime } from './ReturnProjectId';
import { Filesystem, Directory } from '@capacitor/filesystem';

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
  const addCanvasRef = useSiteStore((state) => state.addCanvasRef); // Add canvas ref to Zustand
  const selectedProjectId = useSiteStore((state) => state.selectedProjectId);
  const selectedProject = useSiteStore((state) => 
    state.projects.find(p => p.id === state.selectedProjectId)
  );
  const plans = selectedProject?.plans || [];
  const addToOfflineQueue = useSiteStore((state) => state.addToOfflineQueue);
  const router = useRouter();
  const pdfjs = usePDF();
  const [mounted, setMounted] = useState(false); // Track if the component is mounted
  const [newProjectName, setNewProjectName] = useState('');
  const addProject = useSiteStore((state) => state.addProject);
  const setSelectedProjectId = useSiteStore((state) => state.setSelectedProjectId);
  const projects = useSiteStore((state) => state.projects);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const updatePlanName = useSiteStore((state) => state.updatePlanName);
  const [showRenameConfirm, setShowRenameConfirm] = useState<string | null>(null); // stores planId of plan being renamed
  console.log("plans: ", plans)

  useEffect(() => {
    setMounted(true); // Set to true once component is mounted
  }, []);

  if (!mounted) {
    // Render nothing on the server and until the client mounts
    return null;
  }
  // Handle file upload and rendering to canvas
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file && pdfCanvasRef.current) {
      const base64PDF = await blobToBase64(file);
      // Use selectedProjectId instead of getFirstPlanIdOrDatetime
      const projectId = selectedProjectId;
      const planId = `${Date.now()}`;
      
      if (!projectId) {
        console.error('No project selected');
        return;
      }

      // Get current number of plans to determine the index
      const currentPlans = selectedProject?.plans || [];
      const newIndex = currentPlans.length;
      const defaultName = `Building 1 Floor ${newIndex + 1}`;

      console.log("projectId: ", projectId, "planId: ", planId, file.name);
      addToOfflineQueue(file, projectId, planId);
      // @ts-ignore
      const loadingTask = pdfjs.getDocument(URL.createObjectURL(file));
      loadingTask.promise.then((pdf: any) => {
        const pageNumber = 1;
        pdf.getPage(pageNumber).then((page: any) => {
          const canvas = pdfCanvasRef.current;
          const context = canvas?.getContext('2d');
          const scale = 1.5;
          const viewport = page.getViewport({ scale });

          if (canvas) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            setCanvasDimensions({ width: canvas.width, height: canvas.height });

            // Render PDF page into canvas
            const renderContext = {
              canvasContext: context,
              viewport,
            };
            const renderTask = page.render(renderContext);
            renderTask.promise.then(() => {
              const thumbnail = canvas.toDataURL();

              const newPlan = {
                id: planId,
                name: defaultName, // Use the new default name
                url: base64PDF,
                thumbnail,
                dimensions: { width: canvas.width, height: canvas.height },
                points: [],
                images: [],
                planId: planId,
                projectId: projectId
              };
              addCanvasRef(newPlan.id, pdfCanvasRef.current, base64PDF);
              addPlan(projectId, newPlan);
              setPreviewImage(true);
              
              // Automatically start editing the new plan's name
              setEditingPlanId(planId);
              setEditingName(defaultName);
            });
          }
        });
      });
    }
  };

  function handleDownloadClick() {
    console.log("Downloading project button press")
    downloadProject()
  }
  // Navigate to the PDF view
  const viewPdf = (planUrl: string, planId: string) => {
    console.log("planId: ", planId) 
    router.push({
      pathname: '/pdf-view',
      query: { 
        // dataUrl: planUrl, 
        pdfId: planId
      },  // Passing Base64 URL here
    });
  };

  const handleNameUpdate = (planId: string) => {
    if (editingName.trim() && selectedProjectId) {
      updatePlanName(selectedProjectId, planId, editingName.trim());
      setEditingPlanId(null);
      setEditingName('');
    }
  };

  return (
    <>
      {/* Project Selection */}
      <div className="mb-4">
        <select 
          value={selectedProjectId || ''} 
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          className="mr-2 p-2 border rounded"
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
            className="p-2 border rounded mr-2"
            aria-label="New Project Name"
          />
          <button
            onClick={async () => {
              if (newProjectName.trim()) {
                const projectId = `proj_${Date.now()}`;  // Match the ID format from useSiteStore
                addProject(newProjectName);
                setNewProjectName('');
                await useSiteStore.getState().loadPlans();
                setSelectedProjectId(projectId);  // Auto-select the new project
              }
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 focus:ring-2 focus:ring-blue-300"
          >
            Add Project
          </button>
        </div>
      </div>

      {/* Add a visual cue when project is selected */}
      {selectedProjectId && (
        <div className="mt-2 text-green-600 animate-pulse">
          ↓ Add PDFs to your project here ↓
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
          {/* <button 
            onClick={handleDownloadClick}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-0.1 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800" 
            type="button"
          >
            Download Project
          </button> */}
        </div>
      ) : (
        <p className="text-gray-500">Please select or create a project first</p>
      )}

      <button onClick={() => loginToDropbox()}>
        Log in to Dropbox testing
      </button>
      {/* <button onClick={() => getAccessToken()}>
        
      </button> */}
      <BackupButton />
      <canvas ref={pdfCanvasRef} 
      className="hidden" 
      />

      <div>
        {plans.map((plan, index) => (
          <div key={index} className="mb-4">
            {editingPlanId === plan.id ? (
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="p-1 border rounded"
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
                <p>{plan.name}</p>
                <button
                  onClick={() => setShowRenameConfirm(plan.id)}
                  className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Rename
                </button>
              </div>
            )}
            <img
              // @ts-ignore
              src={plan.thumbnail}
              alt={plan.name}
              onClick={() => viewPdf(plan.url, plan.id)}
              className="max-w-sm cursor-pointer"
            />
          </div>
        ))}
      </div>

      {/* Rename Confirmation Modal */}
      {showRenameConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Are you sure you want to rename this PDF?</h3>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRenameConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const plan = plans.find(p => p.id === showRenameConfirm);
                  if (plan) {
                    setEditingPlanId(plan.id);
                    setEditingName(plan.name || '');
                  }
                  setShowRenameConfirm(null);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Yes, Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PdfPicker;
