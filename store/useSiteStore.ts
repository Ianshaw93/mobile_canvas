import { create } from 'zustand';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Network } from '@capacitor/network';
// import { Network } from '@capacitor/network'; // Import Network Plugin
// import { sendData } from '@/components/ApiCalls';
import { 
  checkCameraPermissions, 
  requestCameraPermissions, 
  requestFileSystemPermissions, 
  requestAllPermissions,
  checkFileSystemPermissions,
  checkAllPermissions,
  addPermissionCallback,
  removePermissionCallback,
  type PermissionStatus
} from '@/components/requestiPermission';
import { generateReportHTML, ReportTemplateData } from '@/utils/reportGenerator';
import { generateProjectReport } from '@/services/ReportService';
import { database } from '@/services/database';
import type { DBProject, DBPlan, DBPoint, DBImage } from '@/services/database';
import { v4 as uuidv4 } from 'uuid';
import { processImageData } from '@/utils/imageProcessing';
// TODO: offline queue actioned only on button press -> goes through series until empty


export type Dimensions = {
  width: number;
  height: number;
};

export interface Point {
  id: string;
  planId: string;
  x: number;
  y: number;
  comment?: string;
  images: Image[];
}

export interface Image {
  id: string;
  pointId: string;
  url: string;
  comment?: string;
  pointIndex: number;
  projectId: string;
  planId: string;
}

export type RenderableContent = {
  type: 'pdf' | 'image';
  data: string | ArrayBuffer;
};

export interface Plan {
  id: string;
  name: string;
  url: string;
  thumbnail: string;
  dimensions: {
    width: number;
    height: number;
    displayScale: number;
  };
  points: any[];
  images: any[];
  planId: string;
  projectId: string;
}

type FileQueueItem = {
  file: File;
  planId: string;
  projectId: string;
};

// Add new Project type
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  plans: Plan[];
}

interface SiteState {
  projects: Project[];
  plans: Plan[];
  points: Point[];
  images: Image[];
  selectedProject: Project | null;
  selectedPlan: Plan | null;
  selectedPoint: Point | null;
  isLoading: boolean;
  error: string | null;
  canvasDimensions: Dimensions;
  pdfLoaded: boolean;
  selectedProjectId: string | null;
  offlineQueue: FileQueueItem[];
  permissionStatus: PermissionStatus;
  canvasRef: Map<string, { canvas: HTMLCanvasElement | null; pdfData: string }>;
  addToast?: (message: string, type: 'success' | 'error') => void;
  initialize: () => Promise<void>;
  createProject: (project: DBProject) => Promise<void>;
  loadProjects: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  loadPlans: () => Promise<void>;
  loadPoints: (planId: string) => Promise<void>;
  loadImages: (pointId: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCanvasDimensions: (dimensions: Dimensions) => void;
  setPdfLoaded: (loaded: boolean) => void;
  setSelectedProjectId: (id: string | null) => void;
  getPlan: (id: string) => Plan | undefined;
  addPoint: (planId: string, point: Point) => Promise<void>;
  deletePoint: (planId: string, pointId: string) => Promise<void>;
  changePointLocation: (planId: string, pointId: string, x: number, y: number) => Promise<void>;
  addImageToPin: (planId: string, pointId: string, image: Image) => Promise<void>;
  deleteImageFromPin: (planId: string, pointId: string, imageId: string) => Promise<void>;
  addCommentToPin: (planId: string, pointId: string, comment: string) => Promise<void>;
  addCommentToImage: (planId: string, pointId: string, imageId: string, comment: string) => Promise<void>;
  addToOfflineQueue: (item: FileQueueItem) => void;
  updateProjectImages: (projectId: string, images: Image[]) => Promise<void>;
  checkPermissions: () => Promise<void>;
  requestCameraPermission: () => Promise<boolean>;
  requestStoragePermission: () => Promise<boolean>;
  addProject: (name: string) => Promise<void>;
  updatePlanName: (projectId: string, planId: string, newName: string) => Promise<void>;
  addPlan: (projectId: string, plan: Plan) => Promise<void>;
  addCanvasRef: (planId: string, canvas: HTMLCanvasElement | null, pdfData: string) => void;
  addImage: (pointId: string, image: { url: string; comment?: string }) => Promise<void>;
  processImage: (img: { url: string; comment?: string }) => Promise<void>;
}

// Helper functions to convert between DB and UI types
const convertDBPointToPoint = (dbPoint: DBPoint, images: Image[] = []): Point => ({
  id: dbPoint.id,
  planId: dbPoint.plan_id,
  x: dbPoint.x,
  y: dbPoint.y,
  comment: dbPoint.comment,
  images: images.filter(img => img.pointId === dbPoint.id)
});

const convertDBImageToImage = (dbImage: DBImage, projectId: string, planId: string): Image => ({
  id: dbImage.id,
  pointId: dbImage.point_id,
  url: dbImage.url,
  comment: dbImage.comment,
  pointIndex: 0, // This will be set by the UI
  projectId,
  planId
});

const convertDBProjectToProject = (dbProject: DBProject, plans: Plan[] = []): Project => ({
  id: dbProject.id,
  name: dbProject.name,
  createdAt: new Date(dbProject.created_at).getTime(),
  updatedAt: new Date(dbProject.updated_at).getTime(),
  plans
});

const useSiteStore = create<SiteState>((set, get) => ({
  projects: [],
  plans: [] as Plan[],
  points: [] as Point[],
  images: [] as Image[],
  selectedProject: null,
  selectedPlan: null,
  selectedPoint: null,
  isLoading: false,
  error: null,
  canvasDimensions: { width: 0, height: 0 },
  pdfLoaded: false,
  selectedProjectId: null,
  offlineQueue: [],
  permissionStatus: { 
    camera: false, 
    storage: false, 
    network: false,
    isChecking: false,
    error: null 
  },
  canvasRef: new Map(),

  initialize: async () => {
    try {
      console.log('[Store] Starting initialization...');
      set({ isLoading: true, error: null });

      // Set up permission callback
      const permissionCallback = (status: PermissionStatus) => {
        set({ permissionStatus: status });
      };
      addPermissionCallback(permissionCallback);

      // Initial permission check
      await checkAllPermissions();

      // Initialize database
      if (Capacitor.isNativePlatform()) {
        console.log('[Store] Initializing database...');
        await database.initialize();
        console.log('[Store] Database initialized successfully');
      }

      console.log('[Store] Loading projects...');
      await get().loadProjects();
      console.log('[Store] Projects loaded successfully');
      set({ isLoading: false });
    } catch (error) {
      console.error('[Store] Error during initialization:', error);
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to initialize store' });
      throw error;
    }
  },

  // Project operations
  createProject: async (dbProject: DBProject) => {
    try {
      console.log('[Store] Creating project:', dbProject.name);
      if (Capacitor.isNativePlatform()) {
        await database.createProject(dbProject);
      }
      const project = convertDBProjectToProject(dbProject);
      set(state => ({
        projects: [...state.projects, project]
      }));
      console.log('[Store] Project created successfully');
    } catch (error) {
      console.error('[Store] Error creating project:', error);
      throw error;
    }
  },

  loadProjects: async () => {
    try {
      console.log('[Store] Loading all projects...');
      if (Capacitor.isNativePlatform()) {
        const dbProjects = await database.getAllProjects();
        const projects = dbProjects.map(p => convertDBProjectToProject(p));
        set({ projects });
      } else {
        set({ projects: [] });
      }
    } catch (error) {
      console.error('[Store] Error loading projects:', error);
      throw error;
    }
  },

  loadProject: async (id: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const dbProject = await database.getProject(id);
        if (dbProject) {
          const project = convertDBProjectToProject(dbProject);
          set(state => ({
            projects: state.projects.map(p => p.id === id ? project : p)
          }));
        }
      }
    } catch (error) {
      console.error('Error loading project:', error);
      throw error;
    }
  },

  // Plan operations
  loadPlans: async () => {
    try {
      const projectId = get().selectedProjectId;
      if (!projectId) {
        set({ plans: [] });
        return;
      }

      if (Capacitor.isNativePlatform()) {
        const dbPlans = await database.getPlansByProject(projectId);
        const plans = dbPlans.map(p => ({
          id: p.id,
          name: p.name,
          url: p.url,
          thumbnail: p.thumbnail,
          dimensions: {
            width: p.width,
            height: p.height,
            displayScale: p.display_scale
          },
          points: [],
          images: [],
          planId: p.id,
          projectId: projectId
        }));
        set({ plans });
      } else {
        set({ plans: [] });
      }
    } catch (error) {
      console.error('Error loading plans:', error);
      throw error;
    }
  },

  // Point operations
  loadPoints: async (planId: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const dbPoints = await database.getPointsByPlan(planId);
        const dbImages = await database.getImagesByPoint(planId);
        const points = dbPoints.map(p => convertDBPointToPoint(p, dbImages.map(img => convertDBImageToImage(img, '', planId))));
        set({ points });
      } else {
        set({ points: [] });
      }
    } catch (error) {
      console.error('Error loading points:', error);
      throw error;
    }
  },

  // Image operations
  loadImages: async (pointId: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const dbImages = await database.getImagesByPoint(pointId);
        const images = dbImages.map(img => convertDBImageToImage(img, '', ''));
        set({ images });
      } else {
        set({ images: [] });
      }
    } catch (error) {
      console.error('Error loading images:', error);
      throw error;
    }
  },

  // Cleanup operations
  deleteProject: async (id: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await database.deleteProject(id);
      }
      set(state => ({
        projects: state.projects.filter(p => p.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  },

  // Canvas operations
  setCanvasDimensions: (dimensions: Dimensions) => {
    set({ canvasDimensions: dimensions });
  },

  setPdfLoaded: (loaded: boolean) => {
    set({ pdfLoaded: loaded });
  },

  setSelectedProjectId: (id: string | null) => {
    set({ selectedProjectId: id });
  },

  getPlan: (id: string) => {
    const { plans } = get();
    return plans.find(plan => plan.id === id);
  },

  // Pin operations
  addPoint: async (planId: string, point: Point) => {
    set(state => ({
      points: [...state.points, point]
    }));
  },

  deletePoint: async (planId: string, pointId: string) => {
    set(state => ({
      points: state.points.filter(p => p.id !== pointId)
    }));
  },

  changePointLocation: async (planId: string, pointId: string, x: number, y: number) => {
    set(state => ({
      points: state.points.map(p =>
        p.id === pointId ? { ...p, x, y } : p
      )
    }));
  },

  addImageToPin: async (planId: string, pointId: string, image: Image) => {
    set(state => ({
      images: [...state.images, image],
      points: state.points.map(p =>
        p.id === pointId
          ? { ...p, images: [...p.images, image] }
          : p
      )
    }));
  },

  deleteImageFromPin: async (planId: string, pointId: string, imageId: string) => {
    set(state => ({
      images: state.images.filter(i => i.id !== imageId),
      points: state.points.map(p =>
        p.id === pointId
          ? { ...p, images: p.images.filter(img => img.id !== imageId) }
          : p
      )
    }));
  },

  addCommentToPin: async (planId: string, pointId: string, comment: string) => {
    set(state => ({
      points: state.points.map(p =>
        p.id === pointId ? { ...p, comment } : p
      )
    }));
  },

  addCommentToImage: async (planId: string, pointId: string, imageId: string, comment: string) => {
    set(state => ({
      images: state.images.map(img =>
        img.id === imageId ? { ...img, comment } : img
      ),
      points: state.points.map(p =>
        p.id === pointId
          ? {
              ...p,
              images: p.images.map(img =>
                img.id === imageId ? { ...img, comment } : img
              )
            }
          : p
      )
    }));
  },

  addToOfflineQueue: (item: FileQueueItem) => {
    set(state => ({
      offlineQueue: [...state.offlineQueue, item]
    }));
  },

  updateProjectImages: async (projectId: string, images: Image[]) => {
    try {
      // TODO: Persist to database when method is available
      set(state => ({
        images: state.images.map(i => 
          i.projectId === projectId ? images.find(img => img.id === i.id) || i : i
        )
      }));
    } catch (error) {
      console.error('Error updating project images:', error);
      throw error;
    }
  },

  checkPermissions: async () => {
    if (typeof window === 'undefined') return;

    try {
      set(state => ({
        permissionStatus: { ...state.permissionStatus, isChecking: true, error: null }
      }));

      // Check camera permission
      const cameraPermission = await Camera.checkPermissions();
      const hasCameraPermission = cameraPermission.camera === 'granted';

      // Check storage permission
      const hasStoragePermission = await checkFileSystemPermissions();

      // Check network status
      const networkStatus = await Network.getStatus();
      const hasNetwork = networkStatus.connected;

      const prevPermissions = get().permissionStatus;

      set(state => ({
        permissionStatus: {
          ...state.permissionStatus,
          camera: hasCameraPermission,
          storage: hasStoragePermission,
          network: hasNetwork,
          isChecking: false
        }
      }));

      // Show toast for permission changes
      if (prevPermissions.camera !== hasCameraPermission) {
        get().addToast?.(
          hasCameraPermission ? 'Camera permission granted' : 'Camera permission denied',
          hasCameraPermission ? 'success' : 'error'
        );
      }

      if (prevPermissions.storage !== hasStoragePermission) {
        get().addToast?.(
          hasStoragePermission ? 'Storage permission granted' : 'Storage permission denied',
          hasStoragePermission ? 'success' : 'error'
        );
      }

      if (prevPermissions.network !== hasNetwork) {
        get().addToast?.(
          hasNetwork ? 'Network connected' : 'Network disconnected',
          hasNetwork ? 'success' : 'error'
        );
      }
    } catch (error: any) {
      console.error('Error checking permissions:', error);
      set(state => ({
        permissionStatus: {
          ...state.permissionStatus,
          isChecking: false,
          error: `Failed to check permissions: ${error?.message || 'Unknown error'}`
        }
      }));
      get().addToast?.('Failed to check permissions', 'error');
    }
  },

  requestCameraPermission: async () => {
    if (typeof window === 'undefined') return false;

    try {
      set(state => ({
        permissionStatus: { ...state.permissionStatus, isChecking: true, error: null }
      }));

      const permission = await Camera.requestPermissions();
      const hasPermission = permission.camera === 'granted';

      set(state => ({
        permissionStatus: {
          ...state.permissionStatus,
          camera: hasPermission,
          isChecking: false
        }
      }));

      get().addToast?.(
        hasPermission ? 'Camera permission granted' : 'Camera permission denied',
        hasPermission ? 'success' : 'error'
      );

      return hasPermission;
    } catch (error: any) {
      console.error('Error requesting camera permission:', error);
      set(state => ({
        permissionStatus: {
          ...state.permissionStatus,
          isChecking: false,
          error: `Failed to request camera permission: ${error?.message || 'Unknown error'}`
        }
      }));
      get().addToast?.('Failed to request camera permission', 'error');
      return false;
    }
  },

  requestStoragePermission: async () => {
    if (typeof window === 'undefined') return false;

    try {
      set(state => ({
        permissionStatus: { ...state.permissionStatus, isChecking: true, error: null }
      }));

      const hasPermission = await requestFileSystemPermissions();

      set(state => ({
        permissionStatus: {
          ...state.permissionStatus,
          storage: hasPermission,
          isChecking: false
        }
      }));

      get().addToast?.(
        hasPermission ? 'Storage permission granted' : 'Storage permission denied',
        hasPermission ? 'success' : 'error'
      );

      return hasPermission;
    } catch (error: any) {
      console.error('Error requesting storage permission:', error);
      set(state => ({
        permissionStatus: {
          ...state.permissionStatus,
          isChecking: false,
          error: `Failed to request storage permission: ${error?.message || 'Unknown error'}`
        }
      }));
      get().addToast?.('Failed to request storage permission', 'error');
      return false;
    }
  },

  addProject: async (name: string) => {
    try {
      const projectId = `proj_${Date.now()}`;
      const now = new Date().toISOString();
      
      const dbProject: DBProject = {
        id: projectId,
        name,
        created_at: now,
        updated_at: now
      };

      if (Capacitor.isNativePlatform()) {
        await database.createProject(dbProject);
      }

      const project: Project = {
        id: projectId,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        plans: []
      };

      set((state) => ({
        projects: [...state.projects, project]
      }));

      get().addToast?.('Project created successfully', 'success');
    } catch (error) {
      console.error('Error creating project:', error);
      get().addToast?.('Failed to create project', 'error');
      throw error;
    }
  },

  updatePlanName: async (projectId: string, planId: string, newName: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await database.updatePlan(planId, { name: newName });
      }

      set((state) => ({
        plans: state.plans.map((plan) =>
          plan.id === planId ? { ...plan, name: newName } : plan
        )
      }));

      get().addToast?.('Plan name updated successfully', 'success');
    } catch (error) {
      console.error('Error updating plan name:', error);
      get().addToast?.('Failed to update plan name', 'error');
      throw error;
    }
  },

  addPlan: async (projectId: string, plan: Plan) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const dbPlan: DBPlan = {
          id: plan.id,
          project_id: projectId,
          name: plan.name,
          url: plan.url,
          thumbnail: plan.thumbnail,
          width: plan.dimensions.width,
          height: plan.dimensions.height,
          display_scale: plan.dimensions.displayScale,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await database.createPlan(dbPlan);
      }

      // Update both the plans array and the project's plans
      set((state) => ({
        plans: [...state.plans, plan],
        projects: state.projects.map((p) =>
          p.id === projectId
            ? { ...p, plans: [...p.plans, plan] }
            : p
        )
      }));

      get().addToast?.('Plan added successfully', 'success');
    } catch (error) {
      console.error('Error adding plan:', error);
      get().addToast?.('Failed to add plan', 'error');
      throw error;
    }
  },

  addCanvasRef: (planId: string, canvas: HTMLCanvasElement | null, pdfData: string) => {
    set((state) => ({
      canvasRef: new Map(state.canvasRef).set(planId, { canvas, pdfData })
    }));
  },

  addImage: async (pointId: string, image: { url: string; comment?: string }) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const dbImage: DBImage = {
          id: uuidv4(),
          point_id: pointId,
          url: image.url,
          comment: image.comment,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await database.createImage(dbImage);
      }

      const newImage: Image = {
        id: uuidv4(),
        pointId,
        url: image.url,
        comment: image.comment,
        pointIndex: 0, // This should be calculated based on existing points
        projectId: '', // This should be passed in or retrieved from context
        planId: '' // This should be passed in or retrieved from context
      };

      set((state) => ({
        images: [...state.images, newImage]
      }));

      get().addToast?.('Image added successfully', 'success');
    } catch (error) {
      console.error('Error adding image:', error);
      get().addToast?.('Failed to add image', 'error');
      throw error;
    }
  },

  processImage: async (img: { url: string; comment?: string }) => {
    try {
      // Process the image
      const processedImage = await processImageData(img.url);
      
      // Add the processed image to the store
      await get().addImage('', {
        url: processedImage,
        comment: img.comment
      });

      get().addToast?.('Image processed successfully', 'success');
    } catch (error) {
      console.error('Error processing image:', error);
      get().addToast?.('Failed to process image', 'error');
      throw error;
    }
  }
}));

export default useSiteStore;

// Add cleanup function
const cleanupStorage = async (state: SiteState) => {
  try {
    const { projects } = state;
    
    // Get all files in the data directory
    const result = await Filesystem.readdir({
      path: '',
      directory: Directory.Data
    });

    // Create a set of all file paths that should be kept
    const keepFiles = new Set(['projects.json']);
    projects.forEach((project: Project) => {
      project.plans.forEach((plan: Plan) => {
        plan.images.forEach((img: Image) => keepFiles.add(img.id));
        plan.points.forEach((point: Point) => {
          point.images.forEach((img: Image) => keepFiles.add(img.id));
        });
      });
    });

    // Delete files that are no longer needed
    for (const file of result.files) {
      if (!keepFiles.has(file.name)) {
        try {
          await Filesystem.deleteFile({
            path: file.name,
            directory: Directory.Data
          });
        } catch (error) {
          console.error(`Error deleting file ${file.name}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up storage:', error);
  }
};

// Modify savePlansToFilesystem to include cleanup
const savePlansToFilesystem = async (projects: Project[], state: SiteState) => {
  try {
    await requestFileSystemPermissions();
    
    // Create a copy of projects with optimized data
    const optimizedProjects = projects.map(project => ({
      ...project,
      plans: project.plans.map(plan => ({
        ...plan,
        images: plan.images.map((img: Image) => ({
          ...img,
          url: img.id
        })),
        points: plan.points.map((point: Point) => ({
          ...point,
          images: point.images.map((img: Image) => ({
            ...img,
            url: img.id
          }))
        }))
      }))
    }));

    await Filesystem.writeFile({
      path: 'projects.json',
      data: JSON.stringify(optimizedProjects),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });

    // Run cleanup after saving
    await cleanupStorage(state);
  } catch (error) {
    console.error('Error saving projects:', error);
    throw error;
  }
};

// Helper function to load plans from the filesystem
const loadPlansFromFilesystem = async (): Promise<Project[]> => {
  try {
    const platform = Capacitor.getPlatform();
    console.log('Current platform:', platform);
    // TODO: Load from database when method is available
    return [];
  } catch (error) {
    console.error('Error loading projects:', error);
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

// // Helper functions to convert between store and DB types
// function dbProjectToStore(dbProject: DBProject): Project {
//   return {
//     id: dbProject.id,
//     name: dbProject.name,
//     createdAt: dbProject.created_at,
//     updatedAt: dbProject.updated_at,
//     plans: [] // Will be populated separately
//   };
// }

// function storeProjectToDB(project: Project): DBProject {
//   return {
//     id: project.id,
//     name: project.name,
//     created_at: project.createdAt,
//     updated_at: project.updatedAt
//   };
// }

// function dbPlanToStore(dbPlan: DBPlan): Plan {
//   return {
//     id: dbPlan.id,
//     projectId: dbPlan.project_id,
//     name: dbPlan.name,
//     url: dbPlan.pdf_path,
//     planId: dbPlan.id,
//     points: [], // Will be populated separately
//     images: [], // Will be populated separately
//     content: {
//       type: 'pdf',
//       data: '' // Will be loaded separately
//     }
//   };
// }

// function storePlanToDB(plan: Plan): DBPlan {
//   return {
//     id: plan.id,
//     project_id: plan.projectId,
//     name: plan.name,
//     pdf_path: plan.url,
//     created_at: Date.now(),
//     updated_at: Date.now()
//   };
// }

// function dbPointToStore(dbPoint: DBPoint): Point {
//   return {
//     id: dbPoint.id,
//     planId: dbPoint.plan_id,
//     x: dbPoint.x,
//     y: dbPoint.y,
//     comment: dbPoint.comment,
//     images: [] // Will be populated separately
//   };
// }

// function storePointToDB(point: Point): DBPoint {
//   return {
//     id: point.id,
//     plan_id: point.planId,
//     x: point.x,
//     y: point.y,
//     comment: point.comment,
//     created_at: Date.now(),
//     updated_at: Date.now()
//   };
// }

// function dbImageToStore(dbImage: DBImage): Image {
//   return {
//     id: dbImage.id,
//     pointId: dbImage.point_id,
//     url: dbImage.path,
//     pointIndex: 0,
//     projectId: '',
//     planId: '',
//     comment: dbImage.comment || ''
//   };
// }

// function storeImageToDB(image: Image): DBImage {
//   return {
//     id: image.id,
//     point_id: image.pointId,
//     path: image.url,
//     created_at: Date.now(),
//     updated_at: Date.now()
//   };
// }