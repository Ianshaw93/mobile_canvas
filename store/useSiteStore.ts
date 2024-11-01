import { create } from 'zustand';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network'; // Import Network Plugin
import { sendData } from '@/components/ApiCalls';
import { requestStoragePermissions } from '@/components/manualPermissions';

// TODO: offline queue actioned only on button press -> goes through series until empty


type Dimensions = {
  width: number;
  height: number;
};

interface Point {
  id: string;
  x: number;
  y: number;
  images: Image[];
  comment: string;
}

type Image = {
  key: string; // Key to retrieve the image from local storage
  pointIndex: number;
  projectId: string;
  planId: string;
  // data: string; // Base64 string of the image 
};

type RenderableContent = {
  type: 'pdf' | 'image'; // Specify the type of content (PDF, image, etc.)
  data: string | ArrayBuffer; // The raw PDF data or base64 string for an image
};

type Plan = {
  id: string;
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

type State = {
  plans: Plan[];
  canvasDimensions: Dimensions | {};
  offlineQueue: FileQueueItem[];
  showPinPopup: boolean;
  isProcessingQueue: boolean; // Add this property to the state type
  userTriggeredBackup: false, // New flag to track if the backup button was clicked
  accessToken: string | null; // Add access token state
  setShowPinPopup: (show: boolean) => void;
  setUserTriggeredBackup: (triggered: boolean) => void;
  setAccessToken: (token: string) => void; // Add function to set the access token
  clearAccessToken: () => void; // Add function to clear the access token
  addPlan: (plan: Plan) => void;
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
};

// Helper function to save plans to the filesystem
const savePlansToFilesystem = async (plans: Plan[]) => {
  await Filesystem.writeFile({
    path: 'plans.json',
    data: JSON.stringify(plans),
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
};

// Helper function to load plans from the filesystem
const loadPlansFromFilesystem = async (): Promise<Plan[]> => {
  try {
    const result = await Filesystem.readFile({
      path: 'plans.json',
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    // @ts-ignore
    return JSON.parse(result.data);
  } catch (error) {
    console.error('Error loading plans from filesystem', error);
    return [];
  }
};
// @ts-ignore
const saveImageToExternalStorage = async (imageUri: string, fileName: string): Promise<string | null> => {
  // try {
    const readResult = await Filesystem.readFile({
      path: imageUri,
    });

    const directory = Capacitor.getPlatform() === 'android' 
      ? Directory.ExternalStorage 
      : Directory.Documents;

    const path = `${fileName}`;
    await Filesystem.writeFile({
      path: path,
      data: readResult.data,
      directory: directory,
      recursive: true,
    });

    // Return the full path of the saved file
    const fullPath = await Filesystem.getUri({
      directory: directory,
      path: path
    });







  //   return fullPath.uri;
  // } catch (error) {
  //   console.error('Error saving image to external storage:', error);
  //   return null;
  // }
};

const useSiteStore = create<State>((set, get) => ({
  plans: [],
  canvasDimensions: {},
  canvasRefs: {},  // Store canvas refs in an object
  offlineQueue: [], // Initialize the offline queue
  pdfLoaded: false,
  isProcessingQueue: false, // Track if the queue is being processed
  hasRequestedPermissions: false,
  accessToken: null, // Initialize access token as null
  userTriggeredBackup: false, // Initialize as false
  showPinPopup: false,
  setShowPinPopup: (show: boolean) => set({ showPinPopup: show }),
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
    const permissionStatus = await requestStoragePermissions()

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
    return get().plans.find((plan) => plan.id === id);
  },
  // addPlan: (newPlan) => set((state) => ({
  //   plans: [...state.plans, newPlan],
  // })),
  addPlan: (plan: Plan) => {
    set((state) => {
      const updatedPlans = [...state.plans, plan];
      savePlansToFilesystem(updatedPlans);
      return { plans: updatedPlans };
    });
  },
  addPoint: (planId: string, point: Point) => {
    set((state) => {
      const updatedPlans = state.plans.map((plan) =>
        plan.id === planId ? { ...plan, points: [...plan.points, point] } : plan
      );
      savePlansToFilesystem(updatedPlans);
      return { plans: updatedPlans };
    });
  },
  changePointLocation: (planId, pointId, x, y) => {
    set((state) => {
      const updatedPlans = state.plans.map((plan) => {
        if (plan.id === planId) {
          const updatedPoints = plan.points.map((point) =>
            point.id === pointId ? { ...point, x, y } : point
          );
          return { ...plan, points: updatedPoints };
        }
        return plan;
      });
      savePlansToFilesystem(updatedPlans);
      return { plans: updatedPlans };
    });
  },
  deletePoint: (planId, pointId) => { 
    set((state) => {
      const updatedPlans = state.plans.map((plan) => {
        if (plan.id === planId) {
          const updatedPoints = plan.points.filter((point) => point.id !== pointId);
          return { ...plan, points: updatedPoints };
        }
        return plan;
      });
      savePlansToFilesystem(updatedPlans);
      return { plans: updatedPlans };
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
      // Save the image to external storage
      if (!image.key) {
        console.error('Image key is undefined');
        return;
      }
  
      // const fileName = `${Date.now()}.jpeg`;
      // saveImageToExternalStorage(image.key, fileName);
  
      // if (!savedImagePath) {
      //   console.error('Failed to save image to external storage');
      //   return;
      // }
      set((state) => {
        const updatedPlans = state.plans.map((plan) => {
          if (plan.id === planId) {
            const updatedPoints = plan.points.map((point) =>
              point.id === pointId ? { ...point, images: [...point.images, image] } : point
            );
            return { ...plan, points: updatedPoints };
          }
          return plan;
        });
        savePlansToFilesystem(updatedPlans);
        return { plans: updatedPlans };
      });
    }catch (error) {
      console.error('Error saving image:', error);
    }
  },
  addCommentToPin: (planId, pointId, comment) => {
    set((state) => {
      const updatedPlans = state.plans.map((plan) => {
        if (plan.id === planId) {
          const updatedPoints = plan.points.map((point) =>
            point.id === pointId ? { ...point, comment: comment } : point
          );
          return { ...plan, points: updatedPoints };
        }
        return plan;
      });
      savePlansToFilesystem(updatedPlans);
      return { plans: updatedPlans };
    });
  },
  addImage: (planId: string, image: Image) => {
    set((state) => {
      const updatedPlans = state.plans.map((plan) =>
        plan.id === planId ? { ...plan, images: [...plan.images, image] } : plan
      );
      savePlansToFilesystem(updatedPlans);
      return { plans: updatedPlans };
    });
  },
  setCanvasDimensions: (dimensions: Dimensions) => {
    set({ canvasDimensions: dimensions });
  },
  loadPlans: async () => {
    const plans = await loadPlansFromFilesystem();
    set({ plans });
  },
  savePlans: async () => {
    const { plans } = get();
    await savePlansToFilesystem(plans);
  },

  
  
}));


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