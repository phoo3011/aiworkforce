const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DEFAULT_DATABASE_PATH = path.resolve(__dirname, 'database.sqlite');

function openDatabase(databasePath = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH) {
  const resolvedPath = databasePath === ':memory:'
    ? databasePath
    : (path.isAbsolute(databasePath) ? databasePath : path.resolve(__dirname, databasePath));

  return new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(resolvedPath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(createDatabaseClient(connection, resolvedPath));
    });
  });
}

function createDatabaseClient(connection, databasePath) {
  return {
    connection,
    databasePath,
    run(sql, parameters = []) {
      return new Promise((resolve, reject) => {
        connection.run(sql, parameters, function onRun(error) {
          if (error) {
            reject(error);
            return;
          }
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    get(sql, parameters = []) {
      return new Promise((resolve, reject) => {
        connection.get(sql, parameters, (error, row) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(row);
        });
      });
    },
    all(sql, parameters = []) {
      return new Promise((resolve, reject) => {
        connection.all(sql, parameters, (error, rows) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(rows);
        });
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        connection.exec(sql, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        connection.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

async function ensureColumn(database, tableName, columnName, definition) {
  const columns = await database.all(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    await database.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function initializeDatabase(database) {
  await database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE
    );
  `);

  // ALTER-safe migrations preserve databases created by the original app.
  await ensureColumn(database, 'students', 'firebase_uid', 'TEXT');
  await ensureColumn(database, 'students', 'status', "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn(database, 'students', 'track', "TEXT NOT NULL DEFAULT 'all'");

  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_students_email_lower ON students(LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_students_firebase_uid ON students(firebase_uid);

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      lesson_order INTEGER NOT NULL,
      youtube_video_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(course_id, slug),
      UNIQUE(course_id, lesson_order),
      FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      checkpoint_key TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      trigger_at_seconds INTEGER,
      google_form_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(lesson_id, checkpoint_key),
      FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lesson_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      material_url TEXT NOT NULL,
      material_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(lesson_id, material_order),
      FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      checkpoint_id INTEGER,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      FOREIGN KEY(checkpoint_id) REFERENCES checkpoints(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_course_order ON lessons(course_id, lesson_order);
    CREATE INDEX IF NOT EXISTS idx_lesson_materials_lesson_order ON lesson_materials(lesson_id, material_order);
    CREATE INDEX IF NOT EXISTS idx_progress_student_lesson ON progress(student_id, lesson_id);
  `);

  // Preserve existing lesson and progress IDs while separating the legacy Developer course.
  const legacyDeveloperCourse = await database.get("SELECT id FROM courses WHERE slug = 'ai-developer'");
  const trainerCourse = await database.get("SELECT id FROM courses WHERE slug = 'ai-developer-trainer'");
  if (legacyDeveloperCourse && !trainerCourse) {
    await database.run(
      "UPDATE courses SET slug = 'ai-developer-trainer', title = 'AI Developer Trainer', description = 'หลักสูตรสายพัฒนา AI สำหรับผู้นำทีมและผู้สอน' WHERE id = ?",
      [legacyDeveloperCourse.id]
    );
  }

  const marketingCourse = await database.get("SELECT id, title FROM courses WHERE slug = 'ai-marketing'");
  if (marketingCourse && (marketingCourse.title === 'AI Marketing Learner')) {
    await database.run(
      "UPDATE courses SET title = 'AI Marketing' WHERE id = ?",
      [marketingCourse.id]
    );
  }

  await database.exec(`
    INSERT INTO courses (slug, title, description)
      VALUES ('ai-developer-trainer', 'AI Developer Trainer', 'หลักสูตรสายพัฒนา AI สำหรับผู้นำทีมและผู้สอน')
      ON CONFLICT(slug) DO NOTHING;

    INSERT INTO courses (slug, title, description)
      VALUES ('ai-developer-learner', 'AI Developer Learner', 'หลักสูตรสายพัฒนา AI สำหรับผู้เรียน')
      ON CONFLICT(slug) DO NOTHING;

    INSERT INTO courses (slug, title, description)
      VALUES ('ai-marketing', 'AI Marketing', 'หลักสูตรสายการตลาดด้วย AI')
      ON CONFLICT(slug) DO NOTHING;
  `);

  return database;
}

module.exports = {
  DEFAULT_DATABASE_PATH,
  initializeDatabase,
  openDatabase
};
