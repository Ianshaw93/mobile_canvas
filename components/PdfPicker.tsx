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
              const thumbnail = canvas.toDataURL(); // Save thumbnail

              // Create a new plan object with the Base64 URL instead of Blob URL
              const newPlan = {
                id: planId, // Unique ID
                url: base64PDF, // Store the Base64 string instead of a Blob URL
                thumbnail, // Thumbnail for preview
                dimensions: { width: canvas.width, height: canvas.height },
                points: [],
                images: [],
                planId: planId,
                projectId: projectId
              };
              addCanvasRef(newPlan.id, pdfCanvasRef.current, base64PDF);
              addPlan(projectId, newPlan); // Add plan to the store
              setPreviewImage(true);
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
          console.log("plan: ", plan),
          <div key={index} className="mb-4">
            <p>{`PDF ${index + 1}`}</p>
            <img
              // @ts-ignore
              src={plan.thumbnail}
              alt={`PDF ${index + 1}`}
              onClick={() => viewPdf(plan.url, plan.id)}
              className="max-w-sm cursor-pointer"
            />
          </div>
        ))}
      </div>
    </>
  );
};

export default PdfPicker;
