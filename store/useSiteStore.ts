import { create } from 'zustand';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
// import { Capacitor } from '@capacitor/core';
// import { Network } from '@capacitor/network'; // Import Network Plugin
// import { sendData } from '@/components/ApiCalls';
import { 
  checkCameraPermissions, 
  requestCameraPermissions, 
  requestFileSystemPermissions, 
  requestAllPermissions 
} from '@/components/requestiPermission';
import { generateReportHTML, ReportTemplateData } from '@/utils/reportGenerator';
import { generateProjectReport } from '@/services/ReportService';
// TODO: offline queue actioned only on button press -> goes through series until empty


export type Dimensions = {
  width: number;
  height: number;
};

export interface Point {
  id: string;
  x: number;
  y: number;
  images: Image[];
  comment: string;
}

export type Image = {
  key: string; // Key to retrieve the image from local storage
  pointIndex: number;
  projectId: string;
  planId: string;
  comment?: string; // Add comment field for images
  url: string;  // Base64 string of the image
  // data: string; // Base64 string of the image 
};

export type RenderableContent = {
  type: 'pdf' | 'image'; // Specify the type of content (PDF, image, etc.)
  data: string | ArrayBuffer; // The raw PDF data or base64 string for an image
};

export type Plan = {
  id: string;
  name?: string;
  url: string; // Path to the PDF file stored on the device
  projectId: string;
  planId: string;
  points: Point[];
  images: Image[];
  content?: RenderableContent; // Renderable content (PDF, images, etc.)
};

type FileQueueItem = {
  file: File;
  planId: string;
  projectId: string;
};

// Add new type for permission status
type PermissionStatus = {
  camera: boolean;
  storage: boolean;
};

// Add new Project type
type Project = {
  id: string;
  name: string;
  createdAt: number;
  plans: Plan[];
  images: Image[];
};

type State = {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  projects: Project[];
  canvasDimensions: Dimensions | {};
  offlineQueue: FileQueueItem[];
  isProcessingQueue: boolean; // Add this property to the state type
  userTriggeredBackup: false, // New flag to track if the backup button was clicked
  accessToken: string | null; // Add access token state
  setUserTriggeredBackup: (triggered: boolean) => void;
  setAccessToken: (token: string) => void; // Add function to set the access token
  clearAccessToken: () => void; // Add function to clear the access token
  addPlan: (projectId: string, plan: Plan) => void;
  addPoint: (planId: string, point: Point) => void;
  changePointLocation: (planId: string, pointId: string, x: number, y: number) => void;
  deletePoint: (planId: string, pointId: string) => void;
  addImage: (planId: string, image: Image) => void;
  addImageToPin: (planId: string, pointId: string, image: Image) => void;
  addCommentToPin: (planId: string, pointId: string, comment: string) => void;
  setCanvasDimensions: (dimensions: Dimensions) => void;
  addCanvasRef: (id: string, ref: HTMLCanvasElement | null, url: string) => void; // Add function to add canvas refs
  getCanvasUrl: (id: string) => string; // Get function to retrieve canvas refs
  loadPlans: () => Promise<void>; // Load plans from filesystem
  savePlans: () => Promise<void>; // Save plans to filesystem
  getPlan: (id: string) => Plan | undefined;
  pdfLoaded: boolean;
  setPdfLoaded: (loaded: boolean) => void;
  getOfflineQueue: () => FileQueueItem[];
  clearOfflineQueue: () => void;
  // removeSingleFromQueue: (file: File) => void;
  addToOfflineQueue: (file: File, planId: string, projectId: string) => void; // New: Add file to queue
  setOfflineQueue: (newQueue: FileQueueItem[]) => void; // New method to directly set the offline queue
  // removeFromOfflineQueue: () => void; // New: Remove file from queue after successful upload
  // processOfflineQueue: () => Promise<void>; // New: Process queue when online
  hasRequestedPermissions: boolean;
  setHasRequestedPermissions: (requested: boolean) => void;
  requestStoragePermissions: () => Promise<void>;
  permissions: PermissionStatus;
  checkAndRequestPermissions: () => Promise<void>;
  addCommentToImage: (planId: string, pointId: string, imageKey: string, comment: string) => void;
  deleteImageFromPin: (planId: string, pointId: string, imageKey: string) => void;
  addProject: (name: string) => void;
  getProject: (id: string) => Project | undefined;
  updateProjectImages: (projectId: string, newImage: Image) => void;
  updatePlanName: (projectId: string, planId: string, name: string) => void;
  generateReport: (projectId: string) => Promise<string>;
};


// Helper function to save plans to the filesystem
const savePlansToFilesystem = async (projects: Project[]) => {
  try {
    await requestFileSystemPermissions();
    await Filesystem.writeFile({
      path: 'projects.json',
      data: JSON.stringify(projects),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
  } catch (error) {
    console.error('Error saving projects:', error);
    throw error;
  }
};

// Helper function to load plans from the filesystem
const loadPlansFromFilesystem = async (): Promise<Project[]> => {
  try {
    await requestFileSystemPermissions();
    const result = await Filesystem.readFile({
      path: 'projects.json',
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    // @ts-ignore
    return JSON.parse(result.data);
  } catch (error) {
    console.error('Error loading projects from filesystem', error);
    return [];
  }
};
// @ts-ignore
const saveImageToExternalStorage = async (imageUri: string, fileName: string): Promise<string | null> => {
  try {
    await requestFileSystemPermissions();
    const readResult = await Filesystem.readFile({
      path: imageUri,
    });

    await Filesystem.writeFile({
      path: fileName,
      data: readResult.data,
      directory: Directory.Documents,
      recursive: true,
    });

    const fullPath = await Filesystem.getUri({
      directory: Directory.Documents,
      path: fileName
    });

    return fullPath.uri;
  } catch (error) {
    console.error('Error saving image:', error);
    return null;
  }
};

const useSiteStore = create<State>((set, get) => ({
  selectedProjectId: null,
  setSelectedProjectId: (id: string | null) => set({ selectedProjectId: id }),
  projects: [], // Replace plans array
  canvasDimensions: {},
  canvasRefs: {},  // Store canvas refs in an object
  offlineQueue: [], // Initialize the offline queue
  pdfLoaded: false,
  isProcessingQueue: false, // Track if the queue is being processed
  hasRequestedPermissions: false,
  accessToken: null, // Initialize access token as null
  userTriggeredBackup: false, // Initialize as false
  // Set access token function
  setAccessToken: (token: string) => set({ accessToken: token }),
  // @ts-ignore
  setUserTriggeredBackup: (triggered: boolean) => set({ userTriggeredBackup: triggered }),

  setHasRequestedPermissions: (requested: boolean) => set({ hasRequestedPermissions: requested }),
  // Clear access token function
  clearAccessToken: () => set({ accessToken: null }),
  // Functions for offline queue
  requestStoragePermissions: async () => {
    const { hasRequestedPermissions, setHasRequestedPermissions } = get();

    // Check if we've already requested permissions
    if (hasRequestedPermissions) {
      console.log("Permissions have already been requested.");
      return;
    }

    // Check current permission status
    const permissionStatus = await requestFileSystemPermissions()
    const camerPermissionStatus = await requestCameraPermissions()
    console.log('File system permission status:', permissionStatus);
    console.log('Camera permission status:', camerPermissionStatus);
    // if (permissionStatus) {
    //   // Request permissions if not granted
    //   // @ts-ignore
    //   const result = await Permissions.request({
    //     permissions: ['android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.READ_EXTERNAL_STORAGE'],
    //   });
    //   console.log(result);
    // } else {
    //   console.log("Permissions already granted.");
    // }

    // Set the flag so we don't request again
    setHasRequestedPermissions(true);
  },
  getOfflineQueue: () => {
    const { offlineQueue } = get();
    return offlineQueue;
  },
  
  clearOfflineQueue: () => set({ offlineQueue: [] }),
  
  // removeSingleFromQueue: (file: File) => {
  //   set((state) => ({
  //     offlineQueue: state.offlineQueue.filter(item => item !== file)
  //   }));
  // },
    // New method to directly set the offline queue
  setOfflineQueue: (updatedQueue: FileQueueItem[]) => set({ offlineQueue: updatedQueue  }),
  addToOfflineQueue: (file: File, planId: string, projectId: string) => {
    set((state) => ({
      offlineQueue: [...state.offlineQueue, { file, planId, projectId }],
    }));
  },
  // removeFromOfflineQueue: () => {
  //   set((state) => ({
  //     offlineQueue: state.offlineQueue.slice(1),
  //   }));
  // },
  // processOfflineQueue: async () => {
  //   const { offlineQueue, removeFromOfflineQueue, isProcessingQueue, accessToken, userTriggeredBackup } = get();
  //   if (!accessToken || !userTriggeredBackup) {
  //       console.log("Backup not triggered by user or missing access token. Exiting process.");
  //     return;
  //   }
  //   if (isProcessingQueue) {
  //     console.log("Already processing the queue. Exiting to prevent multiple processes.");
  //     return;
  //   }
  //   console.log("Files in Offline Queue:");
  //   offlineQueue.forEach((file, index) => {
  //     console.log(`${index + 1}. ${file.name}`);
  //   });
  //   set({ isProcessingQueue: true });
  //   // Only attempt to upload if there are items in the queue
  //   while (offlineQueue.length > 0) {
  //     try {
  //       const file = offlineQueue[0];
  //       console.log(`Attempting to upload file: ${file.name}`);
  //       // Attempt to upload the file (implement your upload logic here)
  //       // await sendData(file);
  //     // Check if the file still exists in the queue (in case of race conditions)
  //     const { offlineQueue: updatedQueue } = get();
  //     if (updatedQueue.length > 0 && updatedQueue[0] === file) {
  //       // Remove from queue after successful upload
  //       removeFromOfflineQueue();
  //       console.log(`Successfully uploaded and removed file: ${file.name}`);
  //       await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
  //     }
  //     } catch (error) {
  //       console.log(`Failed to upload file: ${offlineQueue[0].name}. Stopping processing to avoid infinite loop.`);
  //       break; // Stop processing if upload fails to avoid rapid retries
  //     }
  //   }
  //   set({ isProcessingQueue: false, userTriggeredBackup: false });
  // },
  setPdfLoaded: (loaded: boolean) => {
    set({ pdfLoaded: loaded });
  },
  addCanvasRef: (id: string, ref: HTMLCanvasElement | null, url: string) => {
    console.log('Adding canvas ref', id, ref);
    // @ts-ignore
    set((state) => ({canvasRefs: { ...state.canvasRefs, [id]: url }, }));
  },
  getCanvasUrl: (id: string) => {
    // @ts-ignore
    return get().canvasRefs[id] || null; // Return canvas ref or null if not found
  },
  getPlan: (id: string) => {
    const project = get().projects.find((project) => 
      project.plans.find((plan) => plan.id === id)
    );
    return project?.plans.find((plan) => plan.id === id);
  },
  addProject: (name: string) => {
    set((state) => {
      const newProject = {
        id: `proj_${Date.now()}`,
        name,
        createdAt: Date.now(),
        plans: [],
        images: []
      };
      const updatedProjects = [...state.projects, newProject];
      savePlansToFilesystem(updatedProjects); // Update save function to handle projects
      return { projects: updatedProjects };
    });
  },
  getProject: (id: string) => {
    return get().projects.find((project) => project.id === id);
  },
  addPlan: (projectId: string, plan: Plan) => {
    set((state) => {
      const updatedProjects = state.projects.map(project => {
        if (project.id === projectId) {
          return { ...project, plans: [...project.plans, plan] };
        }
        return project;
      });
      savePlansToFilesystem(updatedProjects);
      return { projects: updatedProjects };
    });
  },
  addPoint: (planId: string, point: Point) => {
    set((state) => {
      const updatedProjects = state.projects.map((project) => {
        const updatedPlans = project.plans.map((plan) =>
          plan.id === planId ? { ...plan, points: [...plan.points, point] } : plan
        );
        return { ...project, plans: updatedPlans };
      });
      savePlansToFilesystem(updatedProjects);
      return { projects: updatedProjects };
    });
  },
  changePointLocation: (planId, pointId, x, y) => {
    set((state) => {
      const updatedProjects = state.projects.map((project) => {
        const updatedPlans = project.plans.map((plan) => {
          if (plan.id === planId) {
            const updatedPoints = plan.points.map((point) =>
              point.id === pointId ? { ...point, x, y } : point
            );
            return { ...plan, points: updatedPoints };
          }
          return plan;
        });
        return { ...project, plans: updatedPlans };
      });
      savePlansToFilesystem(updatedProjects);
      return { projects: updatedProjects };
    });
  },
  deletePoint: (planId, pointId) => { 
    set((state) => {
      const updatedProjects = state.projects.map((project) => {
        const updatedPlans = project.plans.map((plan) => {
          if (plan.id === planId) {
            const updatedPoints = plan.points.filter((point) => point.id !== pointId);
            return { ...plan, points: updatedPoints };
          }
          return plan;
        });
        return { ...project, plans: updatedPlans };
      });
      savePlansToFilesystem(updatedProjects);
      return { projects: updatedProjects };
    });
  },
  // addImageToJson: async(planId, image, imageUrl) => { 
  //   const readResult = await Filesystem.readFile({
  //     path: imageUri,
  //   });

  //   // Create the image object with the base64 data
  //   const imageObject ={
  //     key: imageUrl,
  //     pointIndex: 0, // or another value depending on your use case
  //     data: readResult.data, // base64 string representing the image
  //   };
  //   set((state) => {
  //     const updatedImages = [...state.images, imageObject];
  //   });
  // },
  addImageToPin: async(planId, pointId, image) => {
    try {
      set((state) => {
        const updatedProjects = state.projects.map((project) => {
          const updatedPlans = project.plans.map((plan) =>
            plan.id === planId ? {
              ...plan,
              points: plan.points.map((point) =>
                point.id === pointId ? { ...point, images: [...point.images, image] } : point
              )
            } : plan
          );
          return { ...project, plans: updatedPlans };
        });
        savePlansToFilesystem(updatedProjects);
        return { projects: updatedProjects };
      });
    } catch (error) {
      console.error('Error saving image:', error);
    }
  },
  addCommentToPin: (planId, pointId, comment) => {
    set((state) => {
      const updatedProjects = state.projects.map((project) => {
        const updatedPlans = project.plans.map((plan) =>
          plan.id === planId ? {
            ...plan,
            points: plan.points.map((point) =>
              point.id === pointId ? { ...point, comment } : point
            )
          } : plan
        );
        return { ...project, plans: updatedPlans };
      });
      savePlansToFilesystem(updatedProjects);
      return { projects: updatedProjects };
    });
  },
  addImage: (planId: string, image: Image) => {
    set((state) => {
      const updatedProjects = state.projects.map((project) => {
        const updatedPlans = project.plans.map((plan) =>
          plan.id === planId ? { ...plan, images: [...plan.images, image] } : plan
        );
        return { ...project, plans: updatedPlans };
      });
      savePlansToFilesystem(updatedProjects);
      return { projects: updatedProjects };
    });
  },
  setCanvasDimensions: (dimensions: Dimensions) => {
    set({ canvasDimensions: dimensions });
  },
  loadPlans: async () => {
    const projects = await loadPlansFromFilesystem();
    set({ projects });
  },
  savePlans: async () => {
    const { projects } = get();
    await savePlansToFilesystem(projects);
  },
  permissions: {
    camera: false,
    storage: false
  },
  checkAndRequestPermissions: async () => {
    try {
      const { camera, filesystem } = await requestAllPermissions();
      
      set(state => ({
        permissions: {
          camera,
          storage: filesystem
        }
      }));
    } catch (error) {
      console.error('Error handling permissions:', error);
      set(state => ({
        permissions: {
          camera: false,
          storage: false
        }
      }));
    }
  },
  addCommentToImage: (planId, pointId, imageKey, comment) => {
    set((state) => {
      const updatedProjects = state.projects.map((project) => {
        const updatedPlans = project.plans.map((plan) => {
          if (plan.id === planId) {
            const updatedPoints = plan.points.map((point) => {
              if (point.id === pointId) {
                const updatedImages = point.images.map((image) =>
                  image.key === imageKey ? { ...image, comment } : image
                );
                return { ...point, images: updatedImages };
              }
              return point;
            });
            return { ...plan, points: updatedPoints };
          }
          return plan;
        });
        return { ...project, plans: updatedPlans };
      });
      savePlansToFilesystem(updatedProjects);
      return { projects: updatedProjects };
    });
  },
  deleteImageFromPin: async (planId: string, pointId: string, imageKey: string) => {
    try {
      // Delete the actual file
      await Filesystem.deleteFile({
        path: imageKey,
        directory: Directory.Data
      });

      // Update the state
      set((state) => {
        const newProjects = state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan => {
            if (plan.id === planId) {
              return {
                ...plan,
                points: plan.points.map(point => {
                  if (point.id === pointId) {
                    return {
                      ...point,
                      images: point.images.filter(img => img.key !== imageKey)
                    };
                  }
                  return point;
                })
              };
            }
            return plan;
          })
        }));

        // Save updated state to filesystem
        savePlansToFilesystem(newProjects);
        
        return { projects: newProjects };
      });
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  },
  updateProjectImages: (projectId: string, newImage: Image) => 
    set((state) => {
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          return {
            ...p,
            images: [...p.images, newImage]
          };
        }
        return p;
      });
      savePlansToFilesystem(updatedProjects); // Save to storage
      return { projects: updatedProjects };
    }),
  updatePlanName: (projectId: string, planId: string, name: string) => {
    set((state) => {
      const updatedProjects = state.projects.map((project) => {
        if (project.id === projectId) {
          return {
            ...project,
            plans: project.plans.map((plan) =>
              plan.id === planId ? { ...plan, name } : plan
            ),
          };
        }
        return project;
      });
      savePlansToFilesystem(updatedProjects);
      return { projects: updatedProjects };
    });
  },
  generateReport: async (projectId: string) => {
    try {
      const project = get().projects.find(p => p.id === projectId);
      if (!project) throw new Error('Project not found');
      
      const plans = JSON.parse(JSON.stringify(get().projects.find(p => p.id === projectId)?.plans || []));
      if (!plans.length) throw new Error('No plans found for this project');
      
      console.log("Debug - plans before processing:", plans.map((p: Plan) => ({
        name: p.name,
        pointCount: p.points?.length,
        imageCount: p.images?.length
      })));
      
      // Generate the report HTML
      const reportHtml = await generateReportHTML({
        projectName: project.name,
        plans: plans.map((plan: Plan) => ({
          name: plan.name || 'Unnamed Plan',
          points: plan.points.map((point: Point) => ({
            id: point.id,
            x: point.x,
            y: point.y,
            comment: point.comment || '',
            images: point.images.map((img: Image) => ({
              data: img.url,
              comment: img.comment
            }))
          }))
        })),
        generatedDate: new Date().toLocaleString()
      });

      return reportHtml;
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }
}));

// Initialize permissions check when store is created
useSiteStore.getState().checkAndRequestPermissions();

// Load plans when the store is initialized
useSiteStore.getState().loadPlans();
useSiteStore.getState().requestStoragePermissions();
// // Initialize the queue processing when the app comes online
// Network.addListener('networkStatusChange', async (status) => {
//   if (status.connected && useSiteStore.getState().accessToken) {
//     await useSiteStore.getState().processOfflineQueue();
//   }
// });

export default useSiteStore;

// Add a separate initialization function
export const initializeStore = async () => {
  await useSiteStore.getState().checkAndRequestPermissions();
  await useSiteStore.getState().loadPlans();
  await useSiteStore.getState().requestStoragePermissions();
};