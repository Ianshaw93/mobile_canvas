import { create } from 'zustand';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
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
import type { Project as DBProject, Plan as DBPlan, Point as DBPoint, Image as DBImage } from '../services/database';
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

export type Image = {
  id: string;
  pointId: string;
  url: string;
  pointIndex: number;
  projectId: string;
  planId: string;
  comment?: string;
};

export type RenderableContent = {
  type: 'pdf' | 'image';
  data: string | ArrayBuffer;
};

export interface Plan {
  id: string;
  projectId: string;
  name: string;
  url: string;
  planId: string;
  points: Point[];
  images: Image[];
  content: {
    type: string;
    data: string;
  };
}

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
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  plans: Plan[];
}

interface SiteState {
  projects: DBProject[];
  plans: DBPlan[];
  points: Point[];
  images: Image[];
  selectedProject: DBProject | null;
  selectedPlan: DBPlan | null;
  selectedPoint: Point | null;
  isLoading: boolean;
  error: string | null;
  canvasDimensions: Dimensions;
  pdfLoaded: boolean;
  selectedProjectId: string | null;
  offlineQueue: FileQueueItem[];
  permissionStatus: PermissionStatus;
  initialize: () => Promise<void>;
  createProject: (project: DBProject) => Promise<void>;
  loadProjects: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  loadPlans: (projectId: string) => Promise<void>;
  loadPoints: (planId: string) => Promise<void>;
  loadImages: (pointId: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCanvasDimensions: (dimensions: Dimensions) => void;
  setPdfLoaded: (loaded: boolean) => void;
  setSelectedProjectId: (id: string | null) => void;
  getPlan: (id: string) => DBPlan | undefined;
  addPoint: (planId: string, point: Point) => Promise<void>;
  deletePoint: (planId: string, pointId: string) => Promise<void>;
  changePointLocation: (planId: string, pointId: string, x: number, y: number) => Promise<void>;
  addImageToPin: (planId: string, pointId: string, image: Image) => Promise<void>;
  deleteImageFromPin: (planId: string, pointId: string, imageId: string) => Promise<void>;
  addCommentToPin: (planId: string, pointId: string, comment: string) => Promise<void>;
  addCommentToImage: (planId: string, pointId: string, imageId: string, comment: string) => Promise<void>;
  addToOfflineQueue: (item: FileQueueItem) => void;
  updateProjectImages: (projectId: string, images: Image[]) => Promise<void>;
}

const useSiteStore = create<SiteState>((set, get) => ({
  projects: [],
  plans: [],
  points: [],
  images: [],
  selectedProject: null,
  selectedPlan: null,
  selectedPoint: null,
  isLoading: false,
  error: null,
  canvasDimensions: { width: 0, height: 0 },
  pdfLoaded: false,
  selectedProjectId: null,
  offlineQueue: [],
  permissionStatus: { camera: false, storage: false },

  initialize: async () => {
    try {
      console.log('[Store] Starting initialization...');
      set({ isLoading: true, error: null });
      // TODO: Initialize database when method is available
      console.log('[Store] Database initialized successfully');
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
  createProject: async (project: DBProject) => {
    try {
      console.log('[Store] Creating project:', project.name);
      // await database.createProject(project);
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
      // TODO: Load from database when method is available
      set({ projects: [] });
    } catch (error) {
      console.error('[Store] Error loading projects:', error);
      throw error;
    }
  },

  loadProject: async (id: string) => {
    try {
      // TODO: Load from database when method is available
      set(state => ({
        projects: state.projects.map(p => p.id === id ? p : p)
      }));
    } catch (error) {
      console.error('Error loading project:', error);
      throw error;
    }
  },

  // Plan operations
  loadPlans: async (projectId: string) => {
    try {
      // TODO: Load from database when method is available
      set({ plans: [] });
    } catch (error) {
      console.error('Error loading plans:', error);
      throw error;
    }
  },

  // Point operations
  loadPoints: async (planId: string) => {
    try {
      // TODO: Load from database when method is available
      set({ points: [] });
    } catch (error) {
      console.error('Error loading points:', error);
      throw error;
    }
  },

  // Image operations
  loadImages: async (pointId: string) => {
    try {
      // TODO: Load from database when method is available
      set({ images: [] });
    } catch (error) {
      console.error('Error loading images:', error);
      throw error;
    }
  },

  // Cleanup operations
  deleteProject: async (id: string) => {
    try {
      // TODO: Delete from database when method is available
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
        images: plan.images.map(img => ({
          ...img,
          url: img.id
        })),
        points: plan.points.map(point => ({
          ...point,
          images: point.images.map(img => ({
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