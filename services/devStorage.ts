import type { DBProject, DBPlan, DBPoint, DBImage } from './database';

class DevStorage {
  private static instance: DevStorage;
  private storage: Storage | null = null;

  private constructor() {
    // Only initialize storage on the client side
    if (typeof window !== 'undefined') {
      this.storage = window.localStorage;
    }
  }

  static getInstance(): DevStorage {
    if (!DevStorage.instance) {
      DevStorage.instance = new DevStorage();
    }
    return DevStorage.instance;
  }

  async initialize(): Promise<void> {
    if (!this.storage) {
      throw new Error('Storage not available - must be running in browser environment');
    }

    // Initialize storage with empty arrays if they don't exist
    if (!this.storage.getItem('projects')) {
      this.storage.setItem('projects', JSON.stringify([]));
    }
    if (!this.storage.getItem('plans')) {
      this.storage.setItem('plans', JSON.stringify([]));
    }
    if (!this.storage.getItem('points')) {
      this.storage.setItem('points', JSON.stringify([]));
    }
    if (!this.storage.getItem('images')) {
      this.storage.setItem('images', JSON.stringify([]));
    }
  }

  // Project operations
  async createProject(project: DBProject): Promise<void> {
    if (!this.storage) {
      throw new Error('Storage not available - must be running in browser environment');
    }
    const projects = JSON.parse(this.storage.getItem('projects') || '[]');
    projects.push(project);
    this.storage.setItem('projects', JSON.stringify(projects));
  }

  async getProject(id: string): Promise<DBProject | undefined> {
    if (!this.storage) {
      throw new Error('Storage not available - must be running in browser environment');
    }
    const projects = JSON.parse(this.storage.getItem('projects') || '[]');
    return projects.find((p: DBProject) => p.id === id);
  }

  async getAllProjects(): Promise<DBProject[]> {
    if (!this.storage) {
      throw new Error('Storage not available - must be running in browser environment');
    }
    return JSON.parse(this.storage.getItem('projects') || '[]');
  }

  // Plan operations
  async getPlansByProject(projectId: string, page: number = 1, pageSize: number = 20): Promise<DBPlan[]> {
    if (!this.storage) {
      throw new Error('Storage not available - must be running in browser environment');
    }
    const plans = JSON.parse(this.storage.getItem('plans') || '[]');
    const projectPlans = plans.filter((p: DBPlan) => p.project_id === projectId);
    const start = (page - 1) * pageSize;
    return projectPlans.slice(start, start + pageSize);
  }

  // Point operations
  async getPointsByPlan(planId: string, page: number = 1, pageSize: number = 20): Promise<DBPoint[]> {
    if (!this.storage) {
      throw new Error('Storage not available - must be running in browser environment');
    }
    const points = JSON.parse(this.storage.getItem('points') || '[]');
    const planPoints = points.filter((p: DBPoint) => p.plan_id === planId);
    const start = (page - 1) * pageSize;
    return planPoints.slice(start, start + pageSize);
  }

  // Image operations
  async getImagesByPoint(pointId: string, page: number = 1, pageSize: number = 20): Promise<DBImage[]> {
    if (!this.storage) {
      throw new Error('Storage not available - must be running in browser environment');
    }
    const images = JSON.parse(this.storage.getItem('images') || '[]');
    const pointImages = images.filter((i: DBImage) => i.point_id === pointId);
    const start = (page - 1) * pageSize;
    return pointImages.slice(start, start + pageSize);
  }

  // Cleanup operations
  async deleteProject(id: string): Promise<void> {
    if (!this.storage) {
      throw new Error('Storage not available - must be running in browser environment');
    }
    // Delete project
    const projects = JSON.parse(this.storage.getItem('projects') || '[]');
    this.storage.setItem('projects', JSON.stringify(projects.filter((p: DBProject) => p.id !== id)));

    // Delete associated plans
    const plans = JSON.parse(this.storage.getItem('plans') || '[]');
    const projectPlans = plans.filter((p: DBPlan) => p.project_id === id);
    this.storage.setItem('plans', JSON.stringify(plans.filter((p: DBPlan) => p.project_id !== id)));

    // Delete associated points
    const points = JSON.parse(this.storage.getItem('points') || '[]');
    const planIds = projectPlans.map((p: DBPlan) => p.id);
    this.storage.setItem('points', JSON.stringify(points.filter((p: DBPoint) => !planIds.includes(p.plan_id))));

    // Delete associated images
    const images = JSON.parse(this.storage.getItem('images') || '[]');
    const pointIds = points.filter((p: DBPoint) => planIds.includes(p.plan_id)).map((p: DBPoint) => p.id);
    this.storage.setItem('images', JSON.stringify(images.filter((i: DBImage) => !pointIds.includes(i.point_id))));
  }
}

export const devStorage = DevStorage.getInstance(); 