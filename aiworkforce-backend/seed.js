const fs = require('fs');
const path = require('path');

const { initializeDatabase, openDatabase } = require('./database');

function readStudentEmails() {
  let lines = [];

  if (process.env.STUDENT_CSV_DATA) {
    lines = process.env.STUDENT_CSV_DATA.replace(/^\uFEFF/, '').split(/\r?\n/);
  } else {
    const configuredPath = process.env.STUDENT_SEED_PATH;
    const studentFilePath = configuredPath
      ? (path.isAbsolute(configuredPath) ? configuredPath : path.resolve(__dirname, configuredPath))
      : path.resolve(__dirname, 'students.csv');

    if (!fs.existsSync(studentFilePath)) return [];
    lines = fs.readFileSync(studentFilePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  }

  const studentsMap = new Map();
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (!trimmed || trimmed.startsWith('email') || !trimmed.includes('@')) continue;

    const parts = trimmed.split(',');
    const email = parts[0].trim();
    const track = parts[1] ? parts[1].trim() : 'all';

    studentsMap.set(email, track);
  }

  return Array.from(studentsMap.entries()).map(([email, track]) => ({ email, track }));
}

async function seed() {
  const database = await openDatabase();

  try {
    await initializeDatabase(database);
    const studentsToLoad = readStudentEmails();
    for (const { email, track } of studentsToLoad) {
      const existing = await database.get('SELECT id FROM students WHERE LOWER(email) = ?', [email]);
      if (existing) {
        await database.run(
          "UPDATE students SET status = 'active', track = ? WHERE id = ?",
          [track, existing.id]
        );
      } else {
        await database.run(
          "INSERT INTO students (email, status, track) VALUES (?, 'active', ?)",
          [email, track]
        );
      }
    }

    const studentCount = await database.get('SELECT COUNT(*) AS count FROM students');
    const courseCount = await database.get('SELECT COUNT(*) AS count FROM courses');

    console.log('Database structure is ready.');
    console.log(`Students loaded from private CSV: ${studentsToLoad.length}`);
    console.log(`Existing students preserved: ${studentCount.count}`);
    console.log(`Courses available: ${courseCount.count}`);
    console.log('Active students can access every active course.');
  } finally {
    await database.close();
  }
}

seed().catch((error) => {
  console.error('Unable to initialize database:', error.message);
  process.exit(1);
});
