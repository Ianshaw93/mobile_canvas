import { Capacitor } from '@capacitor/core';
import { SQLiteConnection, SQLiteDBConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import { devStorage } from './devStorage';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  plans: Plan[];
}

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
  pointIndex: number;
  projectId: string;
  planId: string;
  comment?: string;
}

// Database types
export interface DBProject {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface DBPlan {
  id: string;
  project_id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface DBPoint {
  id: string;
  plan_id: string;
  x: number;
  y: number;
  created_at: number;
  updated_at: number;
}

export interface DBImage {
  id: string;
  point_id: string;
  path: string;
  created_at: number;
  updated_at: number;
}

// Helper functions to convert between store and DB types
export function dbProjectToStore(dbProject: DBProject): Project {
  return {
    id: dbProject.id,
    name: dbProject.name,
    createdAt: dbProject.created_at,
    updatedAt: dbProject.updated_at,
    plans: []
  };
}

export function storeProjectToDB(project: Project): DBProject {
  return {
    id: project.id,
    name: project.name,
    created_at: project.createdAt,
    updated_at: project.updatedAt
  };
}

export function dbPlanToStore(dbPlan: DBPlan): Plan {
  return {
    id: dbPlan.id,
    projectId: dbPlan.project_id,
    name: dbPlan.name,
    url: '',
    planId: dbPlan.id,
    points: [],
    images: [],
    content: {
      type: 'pdf',
      data: ''
    }
  };
}

export function storePlanToDB(plan: Plan): DBPlan {
  return {
    id: plan.id,
    project_id: plan.projectId,
    name: plan.name,
    created_at: Date.now(),
    updated_at: Date.now()
  };
}

export function dbPointToStore(dbPoint: DBPoint): Point {
  return {
    id: dbPoint.id,
    planId: dbPoint.plan_id,
    x: dbPoint.x,
    y: dbPoint.y,
    images: []
  };
}

export function storePointToDB(point: Point): DBPoint {
  return {
    id: point.id,
    plan_id: point.planId,
    x: point.x,
    y: point.y,
    created_at: Date.now(),
    updated_at: Date.now()
  };
}

export function dbImageToStore(dbImage: DBImage): Image {
  return {
    id: dbImage.id,
    pointId: dbImage.point_id,
    url: dbImage.path,
    pointIndex: 0,
    projectId: '',
    planId: ''
  };
}

export function storeImageToDB(image: Image): DBImage {
  return {
    id: image.id,
    point_id: image.pointId,
    path: image.url,
    created_at: Date.now(),
    updated_at: Date.now()
  };
}

class Database {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private isInitialized = false;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('[Database] Already initialized, skipping...');
      return;
    }

    try {
      console.log('[Database] Starting initialization...');
      const platform = Capacitor.getPlatform();
      const isDev = process.env.NODE_ENV === 'development';
      
      console.log('[Database] Platform:', platform, 'Development mode:', isDev);

      if (platform === 'web' || isDev) {
        console.log('[Database] Using dev storage');
        await devStorage.initialize();
        this.isInitialized = true;
        return;
      }

      // For native platforms, use SQLite
      console.log('[Database] Using SQLite');
      try {
        // Try to close any existing connection first
        try {
          await this.sqlite.closeConnection('mobile_canvas_db', false);
          console.log('[Database] Closed existing connection');
        } catch (closeError) {
          console.log('[Database] No existing connection to close');
        }

        // Create new connection
        this.db = await this.sqlite.createConnection(
          'mobile_canvas_db',
          false,
          'no-encryption',
          1,
          false
        );

        await this.db.open();
        console.log('[Database] Connection opened successfully');

        // Create tables if they don't exist
        await this.createTables();
        console.log('[Database] Tables created/verified successfully');
        
        this.isInitialized = true;
      } catch (error) {
        console.error('[Database] SQLite initialization error:', error);
        // Fallback to dev storage if SQLite fails
        console.log('[Database] Falling back to dev storage');
        await devStorage.initialize();
        this.isInitialized = true;
      }
    } catch (error) {
      console.error('[Database] Initialization error:', error);
      throw error;
    }
  }

  // Project operations
  async createProject(project: Project): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      return devStorage.createProject(storeProjectToDB(project));
    }

    if (!this.db) throw new Error('Database not initialized');
    const dbProject = storeProjectToDB(project);
    await this.db.run(
      'INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [dbProject.id, dbProject.name, dbProject.created_at, dbProject.updated_at]
    );
  }

  async getProject(id: string): Promise<Project | undefined> {
    if (process.env.NODE_ENV === 'development') {
      const dbProject = await devStorage.getProject(id);
      return dbProject ? dbProjectToStore(dbProject) : undefined;
    }

    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query(
      'SELECT * FROM projects WHERE id = ?',
      [id]
    );
    const dbProject = result.values?.[0] as DBProject | undefined;
    return dbProject ? dbProjectToStore(dbProject) : undefined;
  }

  async getAllProjects(): Promise<Project[]> {
    if (process.env.NODE_ENV === 'development') {
      const dbProjects = await devStorage.getAllProjects();
      return dbProjects.map(dbProjectToStore);
    }

    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query('SELECT * FROM projects');
    const dbProjects = result.values as DBProject[] || [];
    return dbProjects.map(dbProjectToStore);
  }

  // Plan operations
  async getPlansByProject(projectId: string, page: number = 1, pageSize: number = 20): Promise<Plan[]> {
    if (process.env.NODE_ENV === 'development') {
      const dbPlans = await devStorage.getPlansByProject(projectId, page, pageSize);
      return dbPlans.map(dbPlanToStore);
    }

    if (!this.db) throw new Error('Database not initialized');
    const offset = (page - 1) * pageSize;
    const result = await this.db.query(
      'SELECT * FROM plans WHERE project_id = ? LIMIT ? OFFSET ?',
      [projectId, pageSize, offset]
    );
    const dbPlans = result.values as DBPlan[] || [];
    return dbPlans.map(dbPlanToStore);
  }

  // Point operations
  async getPointsByPlan(planId: string, page: number = 1, pageSize: number = 20): Promise<Point[]> {
    if (process.env.NODE_ENV === 'development') {
      const dbPoints = await devStorage.getPointsByPlan(planId, page, pageSize);
      return dbPoints.map(dbPointToStore);
    }

    if (!this.db) throw new Error('Database not initialized');
    const offset = (page - 1) * pageSize;
    const result = await this.db.query(
      'SELECT * FROM points WHERE plan_id = ? LIMIT ? OFFSET ?',
      [planId, pageSize, offset]
    );
    const dbPoints = result.values as DBPoint[] || [];
    return dbPoints.map(dbPointToStore);
  }

  // Image operations
  async getImagesByPoint(pointId: string, page: number = 1, pageSize: number = 20): Promise<Image[]> {
    if (process.env.NODE_ENV === 'development') {
      const dbImages = await devStorage.getImagesByPoint(pointId, page, pageSize);
      return dbImages.map(dbImageToStore);
    }

    if (!this.db) throw new Error('Database not initialized');
    const offset = (page - 1) * pageSize;
    const result = await this.db.query(
      'SELECT * FROM images WHERE point_id = ? LIMIT ? OFFSET ?',
      [pointId, pageSize, offset]
    );
    const dbImages = result.values as DBImage[] || [];
    return dbImages.map(dbImageToStore);
  }

  // Cleanup operations
  async deleteProject(id: string): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      return devStorage.deleteProject(id);
    }

    if (!this.db) throw new Error('Database not initialized');
    await this.db.run('DELETE FROM projects WHERE id = ?', [id]);
  }

  private async createTables(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS points (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE CASCADE
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        point_id TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (point_id) REFERENCES points (id) ON DELETE CASCADE
      )
    `);
  }
}

export const database = new Database(); 