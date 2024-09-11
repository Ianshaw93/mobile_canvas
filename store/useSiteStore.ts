import { create } from 'zustand';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import exp from 'constants';

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
};

type Plan = {
  id: string;
  url: string; // Path to the PDF file stored on the device
  points: Point[];
  images: Image[];
};

type State = {
  plans: Plan[];
  canvasDimensions: Dimensions | {};
  addPlan: (plan: Plan) => void;
  addPoint: (planId: string, point: Point) => void;
  addImage: (planId: string, image: Image) => void;
  addImageToPin: (planId: string, pointId: string, image: Image) => void;
  setCanvasDimensions: (dimensions: Dimensions) => void;
  loadPlans: () => Promise<void>; // Load plans from filesystem
  savePlans: () => Promise<void>; // Save plans to filesystem
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

const useSiteStore = create<State>((set, get) => ({
  plans: [],
  canvasDimensions: {},
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
  addImageToPin: (planId, pointId, image) => {
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

export default useSiteStore;