import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

// Database types
export interface DBProject {
  id: string;
  name: string;
  site_visit_number?: number;
  engineer_name?: string;
  client_name?: string;
  created_at: string;
  updated_at: string;
}

export interface DBPlan {
  id: string;
  project_id: string;
  name: string;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  display_scale: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DBPoint {
  id: string;
  plan_id: string;
  x: number;
  y: number;
  status: 'Open' | 'Closed' | 'Note';
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface DBImage {
  id: string;
  point_id: string;
  url: string;
  comment?: string;
  created_at: string;
  updated_at: string;
}

// Database singleton
class Database {
  private static instance: Database;
  private dbConnection: SQLiteDBConnection | null = null;
  private readonly DB_NAME = 'mobile_canvas_db';
  private readonly DB_VERSION = 5; // Increment for new migrations
  private readonly isNative = Capacitor.isNativePlatform();

  private constructor() {}

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async initialize(): Promise<void> {
    if (!this.isNative) {
      throw new Error('Database is only available in native mode');
    }
    await this.getDBConnection();
  }

  private async getDBConnection(): Promise<SQLiteDBConnection> {
    if (this.dbConnection) {
      return this.dbConnection;
    }

    if (!this.isNative) {
      throw new Error('Database is only available in native mode');
    }

    const sqlite = CapacitorSQLite;
    const sqliteConnection = new SQLiteConnection(sqlite);
    
    // Check if connection exists
    const isConnection = await sqliteConnection.isConnection(this.DB_NAME, false);
    if (isConnection.result) {
      // Get existing connection
      this.dbConnection = await sqliteConnection.retrieveConnection(this.DB_NAME, false);
      await this.dbConnection.open();
      // Ensure migrations run on existing connections as well
      await this.runMigrations();
    } else {
      // Create new connection
      this.dbConnection = await sqliteConnection.createConnection(
        this.DB_NAME,
        false,
        'no-encryption',
        this.DB_VERSION,
        false
      );
      await this.dbConnection.open();
      
      // Create tables if they don't exist
      await this.createTables();
      
      // Run migrations
      await this.runMigrations();
    }
    
    return this.dbConnection;
  }

  private async createTables(): Promise<void> {
    const db = await this.getDBConnection();

    // Create projects table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        site_visit_number INTEGER DEFAULT 1,
        engineer_name TEXT,
        client_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Create plans table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        thumbnail TEXT NOT NULL,
        width REAL NOT NULL,
        height REAL NOT NULL,
        display_scale REAL NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
      );
    `);

    // Create points table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS points (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Open',
        comment TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE CASCADE
      );
    `);

    // Create images table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        point_id TEXT NOT NULL,
        url TEXT NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (point_id) REFERENCES points (id) ON DELETE CASCADE
      );
    `);
  }

  private async runMigrations(): Promise<void> {
    const db = await this.getDBConnection();
    
    try {
      // Migration 1: Ensure display_order in plans
      const plansInfo = await db.query("PRAGMA table_info(plans)");
      const hasDisplayOrder = plansInfo.values?.some((column: any) => column.name === 'display_order');
      if (!hasDisplayOrder) {
        console.log('[DB Migration] Adding display_order column to plans table');
        
        // Add display_order column
        await db.execute('ALTER TABLE plans ADD COLUMN display_order INTEGER DEFAULT 0');
        
        // Migrate existing plans: assign display_order based on creation time
        await db.execute(`
          UPDATE plans 
          SET display_order = (
            SELECT COUNT(*) * 10 
            FROM plans p2 
            WHERE p2.project_id = plans.project_id 
            AND p2.created_at <= plans.created_at
          )
        `);
        
        console.log('[DB Migration] Successfully migrated existing plans with display_order');
      }

      // Migration 2: Add status to points
      const pointsInfo = await db.query("PRAGMA table_info(points)");
      const hasStatus = pointsInfo.values?.some((column: any) => column.name === 'status');
      if (!hasStatus) {
        console.log('[DB Migration] Adding status column to points table');
        await db.execute("ALTER TABLE points ADD COLUMN status TEXT NOT NULL DEFAULT 'Open'");
        // Backfill: set any NULL status to 'Open' (older SQLite may not backfill existing NULLs)
        await db.execute("UPDATE points SET status = 'Open' WHERE status IS NULL");
        console.log('[DB Migration] Successfully added status to points table');
      }

      // Migration 3: Add engineer_name and site_visit_number to projects
      const projectsInfo = await db.query("PRAGMA table_info(projects)");
      const hasEngineerName = projectsInfo.values?.some((column: any) => column.name === 'engineer_name');
      const hasSiteVisitNumber = projectsInfo.values?.some((column: any) => column.name === 'site_visit_number');
      const hasClientName = projectsInfo.values?.some((column: any) => column.name === 'client_name');
      if (!hasEngineerName) {
        console.log('[DB Migration] Adding engineer_name column to projects table');
        await db.execute("ALTER TABLE projects ADD COLUMN engineer_name TEXT");
      }
      if (!hasSiteVisitNumber) {
        console.log('[DB Migration] Adding site_visit_number column to projects table');
        await db.execute("ALTER TABLE projects ADD COLUMN site_visit_number INTEGER DEFAULT 1");
      }

      // Migration 4: Add client_name to projects
      if (!hasClientName) {
        console.log('[DB Migration] Adding client_name column to projects table');
        await db.execute("ALTER TABLE projects ADD COLUMN client_name TEXT");
      }
    } catch (error) {
      console.error('[DB Migration] Error running migrations:', error);
      // Don't throw - let app continue with basic functionality
    }
  }

  // Project operations
  async createProject(project: DBProject): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'INSERT INTO projects (id, name, site_visit_number, engineer_name, client_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [project.id, project.name, project.site_visit_number ?? 1, project.engineer_name ?? null, project.client_name ?? null, project.created_at, project.updated_at]
    );
  }

  async getProject(id: string): Promise<DBProject | undefined> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
    return result.values?.[0] as DBProject | undefined;
  }

  async updateProject(id: string, updates: Partial<DBProject>): Promise<void> {
    const db = await this.getDBConnection();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.site_visit_number !== undefined) {
      setClauses.push('site_visit_number = ?');
      values.push(updates.site_visit_number);
    }
    if (updates.engineer_name !== undefined) {
      setClauses.push('engineer_name = ?');
      values.push(updates.engineer_name);
    }
    if (updates.client_name !== undefined) {
      setClauses.push('client_name = ?');
      values.push(updates.client_name);
    }

    setClauses.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const query = `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`;
    await db.run(query, values);
  }

  async getAllProjects(): Promise<DBProject[]> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
    return result.values as DBProject[] || [];
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.getDBConnection();
    await db.run('DELETE FROM projects WHERE id = ?', [id]);
  }

  // Plan operations
  async createPlan(plan: DBPlan): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'INSERT INTO plans (id, project_id, name, url, thumbnail, width, height, display_scale, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [plan.id, plan.project_id, plan.name, plan.url, plan.thumbnail, plan.width, plan.height, plan.display_scale, plan.display_order, plan.created_at, plan.updated_at]
    );
  }

  async getPlansByProject(projectId: string): Promise<DBPlan[]> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM plans WHERE project_id = ? ORDER BY display_order ASC, created_at ASC', [projectId]);
    return result.values as DBPlan[] || [];
  }

  async deletePlan(id: string): Promise<void> {
    const db = await this.getDBConnection();
    await db.run('DELETE FROM plans WHERE id = ?', [id]);
  }

  async updatePlan(id: string, updates: Partial<DBPlan>): Promise<void> {
    const db = await this.getDBConnection();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.url !== undefined) {
      setClauses.push('url = ?');
      values.push(updates.url);
    }
    if (updates.thumbnail !== undefined) {
      setClauses.push('thumbnail = ?');
      values.push(updates.thumbnail);
    }
    if (updates.width !== undefined) {
      setClauses.push('width = ?');
      values.push(updates.width);
    }
    if (updates.height !== undefined) {
      setClauses.push('height = ?');
      values.push(updates.height);
    }
    if (updates.display_order !== undefined) {
      setClauses.push('display_order = ?');
      values.push(updates.display_order);
    }

    setClauses.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const query = `UPDATE plans SET ${setClauses.join(', ')} WHERE id = ?`;
    await db.run(query, values);
  }

  // Plan reordering operations
  async swapPlanOrder(planId1: string, planId2: string): Promise<void> {
    const db = await this.getDBConnection();
    
    // Get current display_order values
    const plan1 = await db.query('SELECT display_order FROM plans WHERE id = ?', [planId1]);
    const plan2 = await db.query('SELECT display_order FROM plans WHERE id = ?', [planId2]);
    
    if (!plan1.values?.[0] || !plan2.values?.[0]) {
      throw new Error('One or both plans not found');
    }
    
    const order1 = plan1.values[0].display_order;
    const order2 = plan2.values[0].display_order;
    
    // Swap the display_order values
    await db.run('UPDATE plans SET display_order = ?, updated_at = ? WHERE id = ?', 
      [order2, new Date().toISOString(), planId1]);
    await db.run('UPDATE plans SET display_order = ?, updated_at = ? WHERE id = ?', 
      [order1, new Date().toISOString(), planId2]);
  }

  async getAdjacentPlan(projectId: string, planId: string, direction: 'up' | 'down'): Promise<DBPlan | null> {
    const db = await this.getDBConnection();
    
    // Get current plan's display_order
    const currentPlan = await db.query('SELECT display_order FROM plans WHERE id = ?', [planId]);
    if (!currentPlan.values?.[0]) return null;
    
    const currentOrder = currentPlan.values[0].display_order;
    
    let query: string;
    if (direction === 'up') {
      // Find plan with next lower display_order
      query = 'SELECT * FROM plans WHERE project_id = ? AND display_order < ? ORDER BY display_order DESC LIMIT 1';
    } else {
      // Find plan with next higher display_order  
      query = 'SELECT * FROM plans WHERE project_id = ? AND display_order > ? ORDER BY display_order ASC LIMIT 1';
    }
    
    const result = await db.query(query, [projectId, currentOrder]);
    return result.values?.[0] as DBPlan || null;
  }

  // Point operations
  async createPoint(point: DBPoint): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'INSERT INTO points (id, plan_id, x, y, status, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [point.id, point.plan_id, point.x, point.y, point.status, point.comment || null, point.created_at, point.updated_at]
    );
  }

  async getPointsByPlan(planId: string): Promise<DBPoint[]> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM points WHERE plan_id = ? ORDER BY created_at ASC', [planId]);
    return result.values as DBPoint[] || [];
  }

  async getPoint(id: string): Promise<DBPoint | undefined> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM points WHERE id = ?', [id]);
    return result.values?.[0] as DBPoint | undefined;
  }

  async updatePoint(point: DBPoint): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'UPDATE points SET plan_id = ?, x = ?, y = ?, status = ?, comment = ?, updated_at = ? WHERE id = ?',
      [point.plan_id, point.x, point.y, point.status, point.comment || null, point.updated_at, point.id]
    );
  }

  async updatePointPartial(id: string, updates: Partial<Omit<DBPoint, 'id'>>): Promise<void> {
    const db = await this.getDBConnection();
    
    // Get current point to preserve existing values
    const currentPoint = await this.getPoint(id);
    if (!currentPoint) {
      throw new Error(`Point with id ${id} not found`);
    }

    // Merge updates with current values
    const updatedPoint = {
      ...currentPoint,
      ...updates,
      updated_at: new Date().toISOString()
    };

    await db.run(
      'UPDATE points SET plan_id = ?, x = ?, y = ?, status = ?, comment = ?, updated_at = ? WHERE id = ?',
      [updatedPoint.plan_id, updatedPoint.x, updatedPoint.y, updatedPoint.status, updatedPoint.comment || null, updatedPoint.updated_at, id]
    );
  }

  async deletePoint(id: string): Promise<void> {
    const db = await this.getDBConnection();
    await db.run('DELETE FROM points WHERE id = ?', [id]);
  }

  // Image operations
  async createImage(image: DBImage): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'INSERT INTO images (id, point_id, url, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [image.id, image.point_id, image.url, image.comment || null, image.created_at, image.updated_at]
    );
  }

  async getImagesByPoint(pointId: string): Promise<DBImage[]> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM images WHERE point_id = ? ORDER BY created_at ASC', [pointId]);
    return result.values as DBImage[] || [];
  }

  async updateImage(image: DBImage): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'UPDATE images SET url = ?, comment = ?, updated_at = ? WHERE id = ?',
      [image.url, image.comment || null, image.updated_at, image.id]
    );
  }

  async deleteImage(id: string): Promise<void> {
    const db = await this.getDBConnection();
    await db.run('DELETE FROM images WHERE id = ?', [id]);
  }
}

export const database = Database.getInstance(); 