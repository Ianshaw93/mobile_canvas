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
import { grayscaleCanvasInPlace } from '@/utils/pdfGrayscale';
import { computeDimensionRepair, rescalePinForPageChange, rescueLegacyPin, VIEWER_DISPLAY_SCALE } from '@/utils/planCoordinates';
import { Preferences } from '@capacitor/preferences';
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
  status: 'Open' | 'Closed' | 'Note';
  comment?: string;
  images: Image[];
  siteVisitNumber?: number; // Site visit this pin belongs to
}

export interface Image {
  key: string;
  url: string;
  comment?: string;
  pointIndex: number;
  projectId: string;
  planId: string;
  siteVisitNumber?: number; // Site visit this image belongs to
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
  siteVisitNumber?: number; // Site visit this plan belongs to
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
  clientName: string;
  siteVisitNumber: number;
  engineerName: string;
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
  updateProject: (id: string, updates: { name?: string; clientName?: string; siteVisitNumber?: number; engineerName?: string }) => Promise<void>;
  addImageToPin: (planId: string, pointId: string, image: Image) => Promise<void>;
  deleteImageFromPin: (planId: string, pointId: string, imageKey: string) => Promise<void>;
  addCommentToPin: (planId: string, pointId: string, comment: string) => Promise<void>;
  addCommentToImage: (planId: string, pointId: string, imageKey: string, comment: string) => Promise<void>;
  updatePinStatus: (planId: string, pointId: string, status: 'Open' | 'Closed' | 'Note') => Promise<void>;
  addToOfflineQueue: (item: FileQueueItem) => void;
  updateProjectImages: (projectId: string, images: Image[]) => Promise<void>;
  checkPermissions: () => Promise<void>;
  requestCameraPermission: () => Promise<boolean>;
  requestStoragePermission: () => Promise<boolean>;
  addProject: (input: { name: string; clientName: string; siteVisitNumber: number; engineerName: string }) => Promise<string>;
  updatePlanName: (projectId: string, planId: string, newName: string) => Promise<void>;
  replacePlanPdf: (
    projectId: string,
    planId: string,
    replacement: {
      url: string;
      thumbnail: string;
      width: number;
      height: number;
      rescalePins?: { ratioX: number; ratioY: number };
    }
  ) => Promise<void>;
  movePlanUp: (projectId: string, planId: string) => Promise<void>;
  movePlanDown: (projectId: string, planId: string) => Promise<void>;
  deletePlan: (projectId: string, planId: string) => Promise<void>;
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
  loadExportData: (projectId: string) => Promise<{
    project: Project;
    plans: Array<{
      plan: Plan;
      points: Array<{
        point: Point;
        images: Array<{
          key: string;
          url: string;
          data: string; // base64 data
          comment?: string;
        }>;
      }>;
    }>;
  }>;
  runGrayscaleMigrationIfNeeded: () => Promise<void>;
  runDimensionRepairIfNeeded: () => Promise<void>;
}

// Helper functions to convert between DB and UI types
const convertDBPointToPoint = (dbPoint: DBPoint, images: Image[] = []): Point => ({
  id: dbPoint.id,
  planId: dbPoint.plan_id,
  x: dbPoint.x,
  y: dbPoint.y,
  status: dbPoint.status || 'Open',
  comment: dbPoint.comment,
  images: images, // Images will be filtered at the query level
  siteVisitNumber: dbPoint.site_visit_number ?? 1
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
  clientName: dbProject.client_name ?? '',
  siteVisitNumber: dbProject.site_visit_number ?? 1,
  engineerName: dbProject.engineer_name ?? '',
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
  // Placeholders; real implementations are injected below via setState
  runGrayscaleMigrationIfNeeded: async () => {},
  runDimensionRepairIfNeeded: async () => {},

  updateProject: async (id: string, updates: { name?: string; clientName?: string; siteVisitNumber?: number; engineerName?: string }) => {
    try {
      const dbUpdates: Partial<DBProject> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.clientName !== undefined) dbUpdates.client_name = updates.clientName;
      if (updates.siteVisitNumber !== undefined) dbUpdates.site_visit_number = updates.siteVisitNumber;
      if (updates.engineerName !== undefined) dbUpdates.engineer_name = updates.engineerName;
      await database.updateProject(id, dbUpdates);

      set(state => ({
        projects: state.projects.map(p => 
          p.id === id
            ? {
                ...p,
                name: updates.name ?? p.name,
                clientName: updates.clientName ?? p.clientName,
                siteVisitNumber: updates.siteVisitNumber ?? p.siteVisitNumber,
                engineerName: updates.engineerName ?? p.engineerName,
                updatedAt: Date.now()
              }
            : p
        )
      }));
      get().addToast?.('Project details updated', 'success');
    } catch (e) {
      console.error('Error updating project', e);
      get().addToast?.('Failed to update project', 'error');
      throw e;
    }
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

      // Add app lifecycle listeners (native only)
      if (Capacitor.isNativePlatform()) {
        console.log('[Store] Setting up app lifecycle listeners...');
        App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            console.log('[Store] App going inactive - data already saved to SQLite');
          } else {
            console.log('[Store] App becoming active');
          }
        });
        App.addListener('pause', () => {
          console.log('[Store] App paused');
        });
        App.addListener('resume', () => {
          console.log('[Store] App resumed');
        });
      }

      // Initialize database (works on both native and web via jeep-sqlite)
      console.log('[Store] Initializing database...');
      await database.initialize();
      console.log('[Store] Database initialized successfully');

      console.log('[Store] Loading projects...');
      await get().loadProjects();
      console.log('[Store] Projects loaded successfully');
      set({ isLoading: false });
      
      // Run grayscale migration at startup (once)
      await get().runGrayscaleMigrationIfNeeded();
      // Reconcile stored plan dimensions with actual PDF page sizes
      // (repairs pin misalignment from historical grayscale page inflation)
      await get().runDimensionRepairIfNeeded();
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
      await database.createProject(dbProject);
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
      const dbProjects = await database.getAllProjects();
      console.log('[Store] Loaded projects from DB:', dbProjects);

      const projects = await Promise.all(
        dbProjects.map(async (dbProject) => {
          const dbPlans = await database.getPlansByProject(dbProject.id);
          console.log(`[Store] Loaded ${dbPlans.length} plans for project ${dbProject.id}`);

          const plans = await Promise.all(
            dbPlans.map(async (dbPlan) => {
              const dbPoints = await database.getPointsByPlan(dbPlan.id);
              console.log(`[Store] Loaded ${dbPoints.length} points for plan ${dbPlan.id}`);

              const points = await Promise.all(
                dbPoints.map(async (dbPoint) => {
                  const dbImages = await database.getImagesByPoint(dbPoint.id);
                  const images = dbImages.map(dbImg => convertDBImageToImage(dbImg, dbProject.id, dbPlan.id));
                  return convertDBPointToPoint(dbPoint, images);
                })
              );

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
                images: [],
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

      await useSiteStore.getState().runGrayscaleMigrationIfNeeded();
      await useSiteStore.getState().runDimensionRepairIfNeeded();
    } catch (error) {
      console.error('[Store] Error loading projects:', error);
      throw error;
    }
  },

  loadProject: async (id: string) => {
    try {
      const dbProject = await database.getProject(id);
      if (dbProject) {
        const project = convertDBProjectToProject(dbProject);
        set(state => ({
          projects: state.projects.map(p => p.id === id ? project : p)
        }));
      }
    } catch (error) {
      console.error('Error loading project:', error);
      throw error;
    }
  },

  // Cleanup operations
  deleteProject: async (id: string) => {
    try {
      await database.deleteProject(id);
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
      // Save to SQL database FIRST
      const dbPlan = await database.getPlan(planId);
      if (!dbPlan) {
        throw new Error(`Plan not found: ${planId}`);
      }

      const project = await database.getProject(dbPlan.project_id);
      const siteVisitNumber = project?.site_visit_number ?? 1;

      await database.createPoint({
        id: point.id,
        plan_id: planId,
        x: point.x,
        y: point.y,
        status: point.status ?? 'Open',
        comment: point.comment,
        site_visit_number: siteVisitNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      console.log('[Store] Point saved to database:', point.id);

      const pointWithVisit = { ...point, siteVisitNumber };

      set(state => {
        const updatedProjects = state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan =>
            plan.id === planId
              ? { ...plan, points: [...plan.points, pointWithVisit] }
              : plan
          )
        }));
        return { projects: updatedProjects };
      });
    } catch (error) {
      console.error('❌ Error adding point:', error);
      throw error;
    }
  },

  deletePoint: async (planId: string, pointId: string) => {
    try {
      await database.deletePoint(pointId);

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
      const currentPoint = await database.getPoint(pointId);
      if (currentPoint) {
        await database.updatePoint({
          ...currentPoint,
          x: x,
          y: y,
          updated_at: new Date().toISOString()
        });
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
      const dbPlan = await database.getPlan(planId);
      if (!dbPlan) {
        throw new Error(`Plan not found: ${planId}`);
      }

      const dbProject = await database.getProject(dbPlan.project_id);
      const siteVisitNumber = dbProject?.site_visit_number ?? 1;

      await database.createImage({
        id: image.key,
        point_id: pointId,
        url: image.url,
        comment: image.comment || '',
        site_visit_number: siteVisitNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

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
    try {
      await database.deleteImage(imageKey);

      // Update Zustand store
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
    } catch (error) {
      console.error('❌ Error deleting image:', error);
      throw error;
    }
  },

  addCommentToPin: async (planId: string, pointId: string, comment: string) => {
    try {
      const currentPoint = await database.getPoint(pointId);
      if (currentPoint) {
        await database.updatePoint({
          ...currentPoint,
          comment: comment,
          updated_at: new Date().toISOString()
        });
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
      const existingImages = await database.getImagesByPoint(pointId);
      const existingImage = existingImages.find(img => img.id === imageKey);

      if (existingImage) {
        await database.updateImage({
          ...existingImage,
          comment: comment,
          updated_at: new Date().toISOString()
        });
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

  updatePinStatus: async (planId: string, pointId: string, status: 'Open' | 'Closed' | 'Note') => {
    try {
      await database.updatePointPartial(pointId, { status });
      // Update local store
      set(state => ({
        projects: state.projects.map(project => ({
          ...project,
          plans: project.plans.map(plan =>
            plan.id === planId
              ? {
                  ...plan,
                  points: plan.points.map(point =>
                    point.id === pointId ? { ...point, status } : point
                  )
                }
              : plan
          )
        }))
      }));
    } catch (error) {
      console.error('❌ Error updating pin status:', error);
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

  addProject: async (input: { name: string; clientName: string; siteVisitNumber: number; engineerName: string }) => {
    try {
      const projectId = `proj_${Date.now()}`;
      const now = new Date().toISOString();
      
      const dbProject: DBProject = {
        id: projectId,
        name: input.name,
        client_name: input.clientName ?? '',
        site_visit_number: input.siteVisitNumber ?? 1,
        engineer_name: input.engineerName ?? '',
        created_at: now,
        updated_at: now
      };

      await database.createProject(dbProject);

      const project: Project = {
        id: projectId,
        name: input.name,
        clientName: input.clientName ?? '',
        siteVisitNumber: input.siteVisitNumber ?? 1,
        engineerName: input.engineerName ?? '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        plans: []
      };

      set((state) => ({
        projects: [...state.projects, project]
      }));

      get().addToast?.('Project created successfully', 'success');
      return projectId;
    } catch (error) {
      console.error('Error creating project:', error);
      get().addToast?.('Failed to create project', 'error');
      throw error;
    }
  },

  updatePlanName: async (projectId: string, planId: string, newName: string) => {
    try {
      await database.updatePlan(planId, { name: newName });

      // Use nested structure only (like reference branch)
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

  // Swap a plan's PDF while keeping its pins, images and name.
  //
  // Dimensions are always written from the incoming page's scale-1.0 size:
  // the coordinate-space contract is `dimensions === actual page size of
  // plan.url`, and leaving stale dimensions behind would make the startup
  // dimension repair "fix" them later and drag pins with it. `rescalePins`
  // is supplied only when the caller has asked the user what to do about a
  // page-size change; without it pin coordinates are left as they are.
  replacePlanPdf: async (projectId, planId, replacement) => {
    try {
      const { url, thumbnail, width, height, rescalePins } = replacement;

      await database.updatePlan(planId, {
        url,
        thumbnail,
        width,
        height,
        display_scale: VIEWER_DISPLAY_SCALE
      });

      // Persist pin moves before touching in-memory state, so a failure
      // throws before the UI claims pins moved. Every site visit's pins
      // share this plan's coordinate space, so all of them move.
      const plan = get().projects
        .find(p => p.id === projectId)?.plans
        .find(pl => pl.id === planId);
      const movedById = new Map<string, { x: number; y: number }>();

      if (rescalePins) {
        for (const point of plan?.points || []) {
          const moved = rescalePinForPageChange(point, rescalePins.ratioX, rescalePins.ratioY);
          if (moved.x !== point.x || moved.y !== point.y) {
            await database.updatePointPartial(point.id, { x: moved.x, y: moved.y });
            movedById.set(point.id, moved);
          }
        }
        if (movedById.size > 0) {
          console.log(
            `[ReplacePdf] Plan ${planId}: rescaled ${movedById.size} pins by ` +
            `${rescalePins.ratioX.toFixed(3)}x${rescalePins.ratioY.toFixed(3)}`
          );
        }
      }

      set((state) => ({
        projects: state.projects.map(project =>
          project.id === projectId
            ? {
                ...project,
                plans: project.plans.map(pl =>
                  pl.id === planId
                    ? {
                        ...pl,
                        url,
                        thumbnail,
                        dimensions: {
                          ...pl.dimensions,
                          width,
                          height,
                          displayScale: VIEWER_DISPLAY_SCALE
                        },
                        points: (pl.points || []).map(pt =>
                          movedById.has(pt.id) ? { ...pt, ...movedById.get(pt.id)! } : pt
                        )
                      }
                    : pl
                )
              }
            : project
        )
      }));

      get().addToast?.(
        movedById.size > 0
          ? `Plan PDF replaced; ${movedById.size} pin${movedById.size === 1 ? '' : 's'} rescaled`
          : 'Plan PDF replaced successfully',
        'success'
      );
    } catch (error) {
      console.error('Error replacing plan PDF:', error);
      get().addToast?.('Failed to replace plan PDF', 'error');
      throw error;
    }
  },

  movePlanUp: async (projectId: string, planId: string) => {
    try {
      const adjacentPlan = await database.getAdjacentPlan(projectId, planId, 'up');
      if (adjacentPlan) {
        await database.swapPlanOrder(planId, adjacentPlan.id);
      }

      // Reload projects to get updated order
      await get().loadProjects();
      get().addToast?.('Plan moved up successfully', 'success');
    } catch (error) {
      console.error('Error moving plan up:', error);
      get().addToast?.('Failed to move plan up', 'error');
      throw error;
    }
  },

  movePlanDown: async (projectId: string, planId: string) => {
    try {
      const adjacentPlan = await database.getAdjacentPlan(projectId, planId, 'down');
      if (adjacentPlan) {
        await database.swapPlanOrder(planId, adjacentPlan.id);
      }

      // Reload projects to get updated order
      await get().loadProjects();
      get().addToast?.('Plan moved down successfully', 'success');
    } catch (error) {
      console.error('Error moving plan down:', error);
      get().addToast?.('Failed to move plan down', 'error');
      throw error;
    }
  },

  deletePlan: async (projectId: string, planId: string) => {
    try {
      await database.deletePlan(planId);

      // Update local state immediately
      set(state => ({
        projects: state.projects.map(project =>
          project.id === projectId
            ? {
                ...project,
                plans: project.plans.filter(plan => plan.id !== planId)
              }
            : project
        )
      }));

      get().addToast?.('Plan deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting plan:', error);
      get().addToast?.('Failed to delete plan', 'error');
      throw error;
    }
  },

  addPlan: async (projectId: string, plan: Plan) => {
    console.log('[Store] Adding plan:', { projectId, plan });

    try {
      const existingPlans = await database.getPlansByProject(projectId);
      const maxOrder = existingPlans.reduce((max, p) => Math.max(max, p.display_order), 0);
      const nextOrder = maxOrder + 10;

      const dbProject = await database.getProject(projectId);
      const siteVisitNumber = dbProject?.site_visit_number ?? 1;

      await database.createPlan({
        id: plan.id,
        project_id: projectId,
        name: plan.name,
        url: plan.url,
        thumbnail: plan.thumbnail,
        width: plan.dimensions.width,
        height: plan.dimensions.height,
        display_scale: plan.dimensions.displayScale,
        display_order: nextOrder,
        site_visit_number: siteVisitNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

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
      const dbImage: DBImage = {
        id: uuidv4(),
        point_id: pointId,
        url: image.url,
        comment: image.comment,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await database.createImage(dbImage);

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
      
      // Database now works on both native and web

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
  },

  loadExportData: async (projectId: string) => {
    try {
      console.log('📦 Loading export data for project:', projectId);
      
      // Database now works on both native and web

      // Load project from database
      const dbProject = await database.getProject(projectId);
      if (!dbProject) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Load all plans for this project
      const dbPlans = await database.getPlansByProject(projectId);
      
      // Load complete data for each plan
      const plansWithData = await Promise.all(
        dbPlans.map(async (dbPlan) => {
          // Load all points for this plan
          const dbPoints = await database.getPointsByPlan(dbPlan.id);
          
          // Load complete data for each point
          const pointsWithData = await Promise.all(
            dbPoints.map(async (dbPoint) => {
              // Load all images for this point
              const dbImages = await database.getImagesByPoint(dbPoint.id);
              
              // Load base64 data for each image
              const imagesWithData = await Promise.all(
                dbImages.map(async (dbImage) => {
                  try {
                    // Load image data from filesystem
                    const readFile = await Filesystem.readFile({
                      directory: Directory.Data,
                      path: dbImage.id // id contains the filename
                    });

                    return {
                      key: dbImage.id,
                      url: dbImage.url,
                      data: typeof readFile.data === 'string' ? readFile.data : '', // ensure string type
                      comment: dbImage.comment
                    };
                  } catch (error) {
                    console.error(`Error loading image file ${dbImage.id}:`, error);
                    // Return metadata even if file loading fails
                    return {
                      key: dbImage.id,
                      url: dbImage.url,
                      data: '', // empty data if file load fails
                      comment: dbImage.comment
                    };
                  }
                })
              );

              return {
                point: convertDBPointToPoint(dbPoint, []), // Convert without images
                images: imagesWithData
              };
            })
          );

          return {
            plan: {
              id: dbPlan.id,
              name: dbPlan.name,
              url: dbPlan.url,
              thumbnail: dbPlan.thumbnail,
              dimensions: {
                width: dbPlan.width,
                height: dbPlan.height,
                displayScale: dbPlan.display_scale
              },
              points: [], // Will be populated separately
              images: [],
              planId: dbPlan.id,
              projectId: dbProject.id,
              siteVisitNumber: dbPlan.site_visit_number ?? 1
            },
            points: pointsWithData
          };
        })
      );

      console.log('📦 Export data loaded successfully:', {
        projectId,
        planCount: plansWithData.length,
        totalPoints: plansWithData.reduce((sum, p) => sum + p.points.length, 0),
        totalImages: plansWithData.reduce((sum, p) => 
          sum + p.points.reduce((pSum, pt) => pSum + pt.images.length, 0), 0
        )
      });

      return {
        project: convertDBProjectToProject(dbProject, []),
        plans: plansWithData
      };
    } catch (error) {
      console.error('Failed to load export data:', error);
      throw error;
    }
  }
}));

export default useSiteStore;

// Helper: generate grayscale thumbnail from a PDF (data URL or base64)
async function generateGrayscaleThumbnailFromPdf(pdfDataUrlOrBase64: string): Promise<string> {
  // Lazy import pdf.js to avoid SSR issues
  // @ts-ignore
  const pdfjs = await import('pdfjs-dist/build/pdf');
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

  const base64 = pdfDataUrlOrBase64.includes(',')
    ? pdfDataUrlOrBase64.split(',')[1]
    : pdfDataUrlOrBase64;
  const binaryString = typeof atob === 'function' ? atob(base64) : '';
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
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
}

// Helper: read the scale-1.0 page size of a PDF (data URL or base64)
async function readPdfPageSize(pdfDataUrlOrBase64: string): Promise<{ width: number; height: number }> {
  // @ts-ignore
  const pdfjs = await import('pdfjs-dist/build/pdf');
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

  const base64 = pdfDataUrlOrBase64.includes(',')
    ? pdfDataUrlOrBase64.split(',')[1]
    : pdfDataUrlOrBase64;
  const binaryString = typeof atob === 'function' ? atob(base64) : '';
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // @ts-ignore
  const loadingTask = pdfjs.getDocument({ data: bytes.buffer });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    return { width: viewport.width, height: viewport.height };
  } finally {
    try { await pdf.destroy(); } catch { /* best-effort cleanup */ }
  }
}

let dimensionRepairInFlight = false;

// Extend the store with a runtime migration
// Note: defined after the store; reference via useSiteStore.getState()
// @ts-ignore
useSiteStore.setState((state: any) => ({
  ...state,
  // Retired. This rewrote every stored plan PDF to grayscale on startup and
  // is destructive and irreversible: it overwrote plan.url in place, and no
  // colour original is kept anywhere (the plans table has a single url
  // column, the offline queue's File does not survive an app restart, and
  // push uploads plan.url, so the server copy would be greyed too). Its
  // Preferences flag ('grayscale_migration_v3_done') is only set on devices
  // that already ran it, so on a fresh install or after clearing app data it
  // would fire again and grey every plan permanently - including the Word
  // report, which renders from plan.url.
  //
  // Kept as an inert no-op with its call sites intact so this note stays on
  // the code path. Use "Replace PDF" in management mode to restore a colour
  // plan. Do not reinstate without a stored colour original.
  runGrayscaleMigrationIfNeeded: async () => {
    return;
  },

  // Repair migration for pin misalignment: historical grayscale conversion
  // rebuilt PDFs with page geometry inflated 1.5× per conversion, while
  // plan dimensions kept the original file's size. Pins are stored relative
  // to a render of plan.url, so every consumer that divides by stored
  // dimensions (project-page overlay, CSV normalization, backend reports)
  // drifted. The contract is: dimensions === actual scale-1.0 page size of
  // plan.url. This reconciles stored dimensions to that; pins are untouched.
  // Runs per-plan and is idempotent; a verified cache (plan id -> url length)
  // avoids re-parsing unchanged PDFs on every startup while still catching
  // plans whose PDF changes (e.g. pulled from the server).
  runDimensionRepairIfNeeded: async () => {
    if (typeof window === 'undefined') return;
    if (dimensionRepairInFlight) return;
    dimensionRepairInFlight = true;
    try {
      const cacheKey = 'dimension_repair_verified_v1';
      let verified: Record<string, number> = {};
      try {
        const pref = await Preferences.get({ key: cacheKey });
        if (pref.value) verified = JSON.parse(pref.value);
      } catch {
        try {
          verified = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        } catch { verified = {}; }
      }

      const { projects } = useSiteStore.getState();
      const currentPlanIds = new Set<string>();
      let cacheChanged = false;

      for (const project of projects || []) {
        for (const plan of (project?.plans || [])) {
          if (typeof plan?.url !== 'string' || !plan.url) continue;
          currentPlanIds.add(plan.id);
          if (verified[plan.id] === plan.url.length) continue;

          try {
            const actual = await readPdfPageSize(plan.url);
            const stored = {
              width: plan.dimensions?.width || 0,
              height: plan.dimensions?.height || 0
            };
            const repair = computeDimensionRepair(actual, stored);
            // Pins are always placed against a 1.5× render of plan.url, so
            // any other stored displayScale is wrong data (e.g. plans pulled
            // while the server record had no display_scale defaulted to 1).
            const displayScaleWrong =
              plan.dimensions?.displayScale !== VIEWER_DISPLAY_SCALE;

            if (repair.needsRepair || displayScaleWrong) {
              console.log(
                `[DimensionRepair] Plan ${plan.id}: stored ${stored.width}x${stored.height} ds=${plan.dimensions?.displayScale} -> ${repair.width}x${repair.height} ds=${VIEWER_DISPLAY_SCALE}`
              );
              const planUpdates: any = {};
              if (repair.needsRepair) {
                planUpdates.width = repair.width;
                planUpdates.height = repair.height;
              }
              if (displayScaleWrong) {
                planUpdates.display_scale = VIEWER_DISPLAY_SCALE;
              }
              await database.updatePlan(plan.id, planUpdates);

              // Pins provably placed before the inflating code existed are in
              // the pre-inflation space; scale them into the current one.
              const rescuedById = new Map<string, { x: number; y: number }>();
              if (repair.needsRepair && stored.width > 0) {
                const ratio = repair.width / stored.width;
                for (const pt of plan.points || []) {
                  const rescued = rescueLegacyPin(pt, ratio);
                  if (rescued.needsRescale) {
                    await database.updatePointPartial(pt.id, {
                      x: rescued.x,
                      y: rescued.y
                    });
                    rescuedById.set(pt.id, { x: rescued.x, y: rescued.y });
                  }
                }
                if (rescuedById.size > 0) {
                  console.log(
                    `[DimensionRepair] Plan ${plan.id}: rescaled ${rescuedById.size} pre-grayscale pins by ${ratio.toFixed(3)}`
                  );
                }
              }

              useSiteStore.setState((prev: any) => ({
                projects: prev.projects.map((p: any) =>
                  p.id === project.id
                    ? {
                        ...p,
                        plans: p.plans.map((pl: any) =>
                          pl.id === plan.id
                            ? {
                                ...pl,
                                dimensions: {
                                  ...pl.dimensions,
                                  width: repair.width,
                                  height: repair.height,
                                  displayScale: VIEWER_DISPLAY_SCALE
                                },
                                points: (pl.points || []).map((pt: any) =>
                                  rescuedById.has(pt.id)
                                    ? { ...pt, ...rescuedById.get(pt.id) }
                                    : pt
                                )
                              }
                            : pl
                        )
                      }
                    : p
                )
              }));
            }
            verified[plan.id] = plan.url.length;
            cacheChanged = true;
          } catch (e) {
            console.warn('[DimensionRepair] Could not verify plan', plan?.id, e);
          }
        }
      }

      // Prune cache entries for deleted plans
      for (const id of Object.keys(verified)) {
        if (!currentPlanIds.has(id)) {
          delete verified[id];
          cacheChanged = true;
        }
      }

      if (cacheChanged) {
        const serialized = JSON.stringify(verified);
        try {
          await Preferences.set({ key: cacheKey, value: serialized });
        } catch {
          localStorage.setItem(cacheKey, serialized);
        }
      }
    } catch (e) {
      console.error('Error running dimension repair at startup:', e);
    } finally {
      dimensionRepairInFlight = false;
    }
  }
}));

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