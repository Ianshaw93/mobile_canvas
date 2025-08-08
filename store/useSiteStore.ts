import { create } from 'zustand';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
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
  key: string;
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
  deleteProject: (id: string) => Promise<void>;
  setCanvasDimensions: (dimensions: Dimensions) => void;
  setPdfLoaded: (loaded: boolean) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedPoint: (point: Point | null) => void;
  getPlan: (id: string) => Plan | undefined;
  addPoint: (planId: string, point: Point) => Promise<void>;
  deletePoint: (planId: string, pointId: string) => Promise<void>;
  changePointLocation: (planId: string, pointId: string, x: number, y: number) => Promise<void>;
  addImageToPin: (planId: string, pointId: string, image: Image) => Promise<void>;
  deleteImageFromPin: (planId: string, pointId: string, imageKey: string) => Promise<void>;
  addCommentToPin: (planId: string, pointId: string, comment: string) => Promise<void>;
  addCommentToImage: (planId: string, pointId: string, imageKey: string, comment: string) => Promise<void>;
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
  loadFreshPinData: (pointId: string) => Promise<{
    point: DBPoint;
    images: DBImage[];
    imageArrayWithData: Array<{
      key: string;
      url: string;
      data: string;
      comment?: string;
      pointIndex: number;
      projectId: string;
      planId: string;
    }>;
  }>;
}

// Helper functions to convert between DB and UI types
const convertDBPointToPoint = (dbPoint: DBPoint, images: Image[] = []): Point => ({
  id: dbPoint.id,
  planId: dbPoint.plan_id,
  x: dbPoint.x,
  y: dbPoint.y,
  comment: dbPoint.comment,
  images: images // Images will be filtered at the query level
});

const convertDBImageToImage = (dbImage: DBImage, projectId: string, planId: string): Image => ({
  key: dbImage.id,
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

      // ✅ ADD APP LIFECYCLE LISTENERS
      console.log('[Store] Setting up app lifecycle listeners...');
      
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          console.log('🔄 App going inactive/terminating - data already saved to SQLite');
          // Data is already being saved in real-time to SQLite, so nothing needed here
        } else {
          console.log('🔄 App becoming active - ready to load data from SQLite');
        }
      });

      App.addListener('pause', () => {
        console.log('⏸️ App paused - data safely in SQLite database');
      });

      App.addListener('resume', () => {
        console.log('▶️ App resumed - data will load from SQLite as needed');
      });

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
        console.log('[Store] Loaded projects from DB:', dbProjects);
        
        // ✅ Load complete projects with plans and points
        const projects = await Promise.all(
          dbProjects.map(async (dbProject) => {
            // Load plans for this project
            const dbPlans = await database.getPlansByProject(dbProject.id);
            console.log(`[Store] Loaded ${dbPlans.length} plans for project ${dbProject.id}`);
            
            // Load points for each plan
            const plans = await Promise.all(
              dbPlans.map(async (dbPlan) => {
                const dbPoints = await database.getPointsByPlan(dbPlan.id);
                console.log(`[Store] Loaded ${dbPoints.length} points for plan ${dbPlan.id}`);
                
                // Convert DB points to UI points (with images)
                const points = await Promise.all(
                  dbPoints.map(async (dbPoint) => {
                    const dbImages = await database.getImagesByPoint(dbPoint.id);
                    const images = dbImages.map(dbImg => convertDBImageToImage(dbImg, dbProject.id, dbPlan.id));
                    return convertDBPointToPoint(dbPoint, images);
                  })
                );
                
                // Convert DB plan to UI plan
                return {
                  id: dbPlan.id,
                  name: dbPlan.name,
                  url: dbPlan.url,
                  thumbnail: dbPlan.thumbnail,
                  dimensions: {
                    width: dbPlan.width,
                    height: dbPlan.height,
                    displayScale: dbPlan.display_scale
                  },
                  points: points,
                  images: [], // Legacy field
                  planId: dbPlan.id,
                  projectId: dbProject.id
                } as Plan;
              })
            );
            
            return convertDBProjectToProject(dbProject, plans);
          })
        );
        
        console.log('[Store] Loaded complete projects with plans and points:', projects);
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

  setSelectedPoint: (point: Point | null) => {
    set({ selectedPoint: point });
  },

  getPlan: (id: string) => {
    const state = get();
    // Search through nested projects.plans structure like reference branch
    for (const project of state.projects) {
      const plan = project.plans.find(p => p.id === id);
      if (plan) return plan;
    }
    return undefined;
  },

  // Pin operations
  addPoint: async (planId: string, point: Point) => {
    console.log('[Store] Adding point:', { planId, point });
    
    try {
      // ✅ Save to SQL database FIRST
      if (Capacitor.isNativePlatform()) {
        await database.createPoint({
          id: point.id,
          plan_id: planId,
          x: point.x,
          y: point.y,
          comment: point.comment,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        console.log('✅ Point saved to SQL database:', point.id);
      }

      // Then update Zustand store
      set(state => {
        const updatedProjects = state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan =>
            plan.id === planId
              ? { ...plan, points: [...plan.points, point] }
              : plan
          )
        }));

        console.log('[Store] Point added to store and SQL:', { planId, point });
        return { projects: updatedProjects };
      });
    } catch (error) {
      console.error('❌ Error adding point:', error);
      throw error;
    }
  },

  deletePoint: async (planId: string, pointId: string) => {
    try {
      // ✅ Delete from SQL database FIRST
      if (Capacitor.isNativePlatform()) {
        await database.deletePoint(pointId);
        console.log('✅ Point deleted from SQL database:', pointId);
      }

      // Then update Zustand store
      set(state => ({
        projects: state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan =>
            plan.id === planId
              ? { ...plan, points: plan.points.filter(p => p.id !== pointId) }
              : plan
          )
        }))
      }));
    } catch (error) {
      console.error('❌ Error deleting point:', error);
      throw error;
    }
  },

  changePointLocation: async (planId: string, pointId: string, x: number, y: number) => {
    try {
      // ✅ Save to SQL database FIRST
      if (Capacitor.isNativePlatform()) {
        // Get current point data to preserve other fields
        const currentPoint = await database.getPoint(pointId);
        if (currentPoint) {
          await database.updatePoint({
            ...currentPoint,
            x: x,
            y: y,
            updated_at: new Date().toISOString()
          });
          console.log('✅ Point location updated in SQL database:', pointId);
        }
      }

      // Then update Zustand store
      set(state => ({
        projects: state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan =>
            plan.id === planId
              ? { 
                  ...plan, 
                  points: plan.points.map(p =>
                    p.id === pointId ? { ...p, x, y } : p
                  )
                }
              : plan
          )
        }))
      }));
    } catch (error) {
      console.error('❌ Error changing point location:', error);
      throw error;
    }
  },

  addImageToPin: async (planId: string, pointId: string, image: Image) => {
    console.log('📍 Store addImageToPin called:', { planId, pointId, image });
    
    try {
      if (Capacitor.isNativePlatform()) {
        await database.createImage({
          id: image.key,
          point_id: pointId,
          url: image.url,
          comment: image.comment || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      set(state => {
        const updatedProjects = state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan =>
            plan.id === planId
              ? {
                  ...plan,
                  points: plan.points.map(point =>
                    point.id === pointId
                      ? { ...point, images: [...point.images, image] }
                      : point
                  )
                }
              : plan
          )
        }));

        console.log('📍 Store updated - new projects structure:', updatedProjects);
        
        // Find the updated point for debugging
        const updatedProject = updatedProjects.find(p => p.plans.some(pl => pl.id === planId));
        const updatedPlan = updatedProject?.plans.find(pl => pl.id === planId);
        const updatedPoint = updatedPlan?.points.find(pt => pt.id === pointId);
        console.log('📍 Updated point after adding image:', updatedPoint);

        return {
          projects: updatedProjects
        };
      });
    } catch (error) {
      console.error('Error adding image to pin:', error);
      throw error;
    }
  },

  deleteImageFromPin: async (planId: string, pointId: string, imageKey: string) => {
    set(state => ({
      projects: state.projects.map(project => ({
        ...project,
        plans: project.plans.map(plan =>
          plan.id === planId
            ? {
                ...plan,
                points: plan.points.map(point =>
                  point.id === pointId
                    ? { ...point, images: point.images.filter((img: Image) => img.key !== imageKey) }
                    : point
                )
              }
            : plan
        )
      }))
    }));
  },

  addCommentToPin: async (planId: string, pointId: string, comment: string) => {
    try {
      // ✅ Save to SQL database FIRST
      if (Capacitor.isNativePlatform()) {
        // Get current point data to preserve other fields
        const currentPoint = await database.getPoint(pointId);
        if (currentPoint) {
          await database.updatePoint({
            ...currentPoint,
            comment: comment,
            updated_at: new Date().toISOString()
          });
          console.log('✅ Point comment saved to SQL database:', pointId);
        }
      }

      // Then update Zustand store
      set(state => ({
        projects: state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan =>
            plan.id === planId
              ? {
                  ...plan,
                  points: plan.points.map(point =>
                    point.id === pointId ? { ...point, comment } : point
                  )
                }
              : plan
          )
        }))
      }));
    } catch (error) {
      console.error('❌ Error adding comment to pin:', error);
      throw error;
    }
  },

  addCommentToImage: async (planId: string, pointId: string, imageKey: string, comment: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        // Get existing image data to preserve URL and other fields
        const existingImages = await database.getImagesByPoint(pointId);
        const existingImage = existingImages.find(img => img.id === imageKey);
        
        if (existingImage) {
          // Update only the comment and timestamp, preserve all other data
          await database.updateImage({
            ...existingImage,
            comment: comment,
            updated_at: new Date().toISOString()
          });
          console.log('✅ Successfully updated comment for image:', imageKey);
        } else {
          console.error('❌ Could not find existing image to update:', imageKey);
        }
      }

      // Update state using nested structure only
      set(state => ({
        projects: state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan =>
            plan.id === planId
              ? {
                  ...plan,
                  points: plan.points.map(point =>
                    point.id === pointId
                      ? {
                          ...point,
                          images: point.images.map((img: Image) =>
                            img.key === imageKey ? { ...img, comment } : img
                          )
                        }
                      : point
                  )
                }
              : plan
          )
        }))
      }));
    } catch (error) {
      console.error('Error adding comment to image:', error);
      throw error;
    }
  },

  addToOfflineQueue: (item: FileQueueItem) => {
    set(state => ({
      offlineQueue: [...state.offlineQueue, item]
    }));
  },

  updateProjectImages: async (projectId: string, images: Image[]) => {
    try {
      // Update using nested structure only
      set(state => ({
        projects: state.projects.map(project =>
          project.id === projectId
            ? {
                ...project,
                plans: project.plans.map(plan => ({
                  ...plan,
                  points: plan.points.map(point => ({
                    ...point,
                    images: point.images.map((img: Image) => 
                      images.find((newImg: Image) => newImg.key === img.key) || img
                    )
                  }))
                }))
              }
            : project
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

      // ✅ Use nested structure only (like reference branch)
      set((state) => ({
        projects: state.projects.map(project =>
          project.id === projectId
            ? {
                ...project,
                plans: project.plans.map(plan =>
                  plan.id === planId ? { ...plan, name: newName } : plan
                )
              }
            : project
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
    console.log('[Store] Adding plan:', { projectId, plan });
    
    try {
      // ✅ Save to SQL database FIRST
      if (Capacitor.isNativePlatform()) {
        await database.createPlan({
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
        });
        console.log('✅ Plan saved to SQL database:', plan.id);
      }

      // Then update Zustand store  
      set(state => {
        const updatedProjects = state.projects.map(project => {
          if (project.id === projectId) {
            return {
              ...project,
              plans: [...project.plans, plan]
            };
          }
          return project;
        });

        console.log('[Store] Plan added to store and SQL:', { projectId, plan: plan.id });
        return { projects: updatedProjects };
      });
    } catch (error) {
      console.error('❌ Error adding plan:', error);
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
        key: uuidv4(),
        url: image.url,
        comment: image.comment,
        pointIndex: 0, // This should be calculated based on existing points
        projectId: '', // This should be passed in or retrieved from context
        planId: '' // This should be passed in or retrieved from context
      };

      // Add to nested structure only
      set(state => ({
        projects: state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan => ({
            ...plan,
            points: plan.points.map(point =>
              point.id === pointId
                ? { ...point, images: [...point.images, newImage] }
                : point
            )
          }))
        }))
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
  },

  loadFreshPinData: async (pointId: string) => {
    try {
      console.log('🔄 Loading fresh pin data from SQL for pointId:', pointId);
      
      if (!Capacitor.isNativePlatform()) {
        throw new Error('SQL database only available in native mode');
      }

      // Load fresh point from SQL
      const dbPoint = await database.getPoint(pointId);
      if (!dbPoint) {
        throw new Error(`Point with id ${pointId} not found`);
      }

      // Load fresh images from SQL
      const dbImages = await database.getImagesByPoint(pointId);
      console.log('🔄 Loaded images from SQL:', dbImages);

      // Load base64 data for each image from filesystem
      const imageArrayWithData = await Promise.all(
        dbImages.map(async (dbImage, index) => {
          try {
            // Load image data from filesystem
            const readFile = await Filesystem.readFile({
              directory: Directory.Data,
              path: dbImage.id // id contains the filename
            });

            return {
              key: dbImage.id,
              url: dbImage.url,
              data: `data:image/jpeg;base64,${readFile.data}`,
              comment: dbImage.comment,
              pointIndex: index,
              projectId: '', // Will be derived from context
              planId: dbPoint.plan_id
            };
          } catch (error) {
            console.error(`Error loading image file ${dbImage.url}:`, error);
            // Return image metadata even if file loading fails
            return {
              key: dbImage.id,
              url: dbImage.url,
              data: '', // Empty data if file load fails
              comment: dbImage.comment,
              pointIndex: index,
              projectId: '',
              planId: dbPoint.plan_id
            };
          }
        })
      );

      console.log('🔄 Fresh pin data loaded successfully:', {
        point: dbPoint,
        imageCount: dbImages.length,
        imageArrayWithDataCount: imageArrayWithData.length
      });

      return {
        point: dbPoint,
        images: dbImages,
        imageArrayWithData
      };
    } catch (error) {
      console.error('Failed to load fresh pin data from SQL:', error);
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
        plan.images.forEach((img: Image) => keepFiles.add(img.key));
        plan.points.forEach((point: Point) => {
          point.images.forEach((img: Image) => keepFiles.add(img.key));
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
          url: img.key
        })),
        points: plan.points.map((point: Point) => ({
          ...point,
          images: point.images.map((img: Image) => ({
            ...img,
            url: img.key
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