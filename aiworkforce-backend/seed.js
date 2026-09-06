const fs = require('fs');
const path = require('path');

const { initializeDatabase, openDatabase } = require('./database');

function readStudentEmails() {
  const configuredPath = process.env.STUDENT_SEED_PATH;
  const studentFilePath = configuredPath
    ? (path.isAbsolute(configuredPath) ? configuredPath : path.resolve(__dirname, configuredPath))
    : path.resolve(__dirname, 'students.csv');

  if (!fs.existsSync(studentFilePath)) return [];

  return [...new Set(fs.readFileSync(studentFilePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && line !== 'email' && line.includes('@')))];
}

async function seed() {
  const database = await openDatabase();

  try {
    await initializeDatabase(database);
    const emails = readStudentEmails();

    for (const email of emails) {
      const existing = await database.get('SELECT id FROM students WHERE LOWER(email) = ?', [email]);
      if (existing) {
        await database.run(
          "UPDATE students SET status = 'active' WHERE id = ?",
          [existing.id]
        );
      } else {
        await database.run(
          "INSERT INTO students (email, status) VALUES (?, 'active')",
          [email]
        );
      }
    }

    const studentCount = await database.get('SELECT COUNT(*) AS count FROM students');
    const courseCount = await database.get('SELECT COUNT(*) AS count FROM courses');

    console.log('Database structure is ready.');
    console.log(`Students loaded from private CSV: ${emails.length}`);
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
