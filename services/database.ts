import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

// Database types
export interface DBProject {
  id: string;
  name: string;
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
  created_at: string;
  updated_at: string;
}

export interface DBPoint {
  id: string;
  plan_id: string;
  x: number;
  y: number;
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
    } else {
      // Create new connection
      this.dbConnection = await sqliteConnection.createConnection(
        this.DB_NAME,
        false,
        'no-encryption',
        1,
        false
      );
      await this.dbConnection.open();
      
      // Create tables if they don't exist
      await this.createTables();
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

  // Project operations
  async createProject(project: DBProject): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [project.id, project.name, project.created_at, project.updated_at]
    );
  }

  async getProject(id: string): Promise<DBProject | undefined> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
    return result.values?.[0] as DBProject | undefined;
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
      'INSERT INTO plans (id, project_id, name, url, thumbnail, width, height, display_scale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [plan.id, plan.project_id, plan.name, plan.url, plan.thumbnail, plan.width, plan.height, plan.display_scale, plan.created_at, plan.updated_at]
    );
  }

  async getPlansByProject(projectId: string): Promise<DBPlan[]> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM plans WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
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
    if (updates.width !== undefined) {
      setClauses.push('width = ?');
      values.push(updates.width);
    }
    if (updates.height !== undefined) {
      setClauses.push('height = ?');
      values.push(updates.height);
    }

    setClauses.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const query = `UPDATE plans SET ${setClauses.join(', ')} WHERE id = ?`;
    await db.run(query, values);
  }

  // Point operations
  async createPoint(point: DBPoint): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'INSERT INTO points (id, plan_id, x, y, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [point.id, point.plan_id, point.x, point.y, point.comment || null, point.created_at, point.updated_at]
    );
  }

  async getPointsByPlan(planId: string): Promise<DBPoint[]> {
    const db = await this.getDBConnection();
    const result = await db.query('SELECT * FROM points WHERE plan_id = ? ORDER BY created_at DESC', [planId]);
    return result.values as DBPoint[] || [];
  }

  async updatePoint(point: DBPoint): Promise<void> {
    const db = await this.getDBConnection();
    await db.run(
      'UPDATE points SET x = ?, y = ?, comment = ?, updated_at = ? WHERE id = ?',
      [point.x, point.y, point.comment || null, point.updated_at, point.id]
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
    const result = await db.query('SELECT * FROM images WHERE point_id = ? ORDER BY created_at DESC', [pointId]);
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