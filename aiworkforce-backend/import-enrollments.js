const fs = require('fs');
const path = require('path');

const { initializeDatabase, openDatabase } = require('./database');

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }

  values.push(value.trim());
  return values;
}

function readRows(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'));

  if (lines.length < 2) throw new Error('CSV must contain a header and at least one data row.');

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  for (const requiredHeader of ['email', 'course_slug']) {
    if (!headers.includes(requiredHeader)) throw new Error(`Missing required CSV column: ${requiredHeader}`);
  }

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    return {
      ...Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])),
      rowNumber: rowIndex + 2
    };
  });
}

async function importEnrollments() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: npm run import:enrollments -- path/to/enrollments.csv');

  const resolvedInputPath = path.resolve(inputPath);
  const rows = readRows(resolvedInputPath);
  const database = await openDatabase();

  try {
    await initializeDatabase(database);
    await database.exec('BEGIN IMMEDIATE TRANSACTION;');

    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      const courseSlug = row.course_slug.trim().toLowerCase();
      const enrollmentStatus = (row.status || 'active').trim().toLowerCase();
      const expiresAt = (row.expires_at || '').trim() || null;

      if (!email || !email.includes('@')) throw new Error(`Invalid email on CSV row ${row.rowNumber}`);
      if (!['active', 'suspended', 'expired'].includes(enrollmentStatus)) {
        throw new Error(`Invalid status on CSV row ${row.rowNumber}`);
      }
      if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
        throw new Error(`Invalid expires_at date on CSV row ${row.rowNumber}`);
      }

      const course = await database.get('SELECT id FROM courses WHERE slug = ?', [courseSlug]);
      if (!course) throw new Error(`Unknown course '${courseSlug}' on CSV row ${row.rowNumber}`);

      const existingStudent = await database.get(
        'SELECT id FROM students WHERE LOWER(email) = ?',
        [email]
      );
      if (existingStudent) {
        await database.run(
          "UPDATE students SET status = 'active' WHERE id = ?",
          [existingStudent.id]
        );
      } else {
        await database.run(
          "INSERT INTO students (email, status) VALUES (?, 'active')",
          [email]
        );
      }

      const student = await database.get('SELECT id FROM students WHERE LOWER(email) = ?', [email]);
      await database.run(`
        INSERT INTO enrollments (student_id, course_id, status, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(student_id, course_id) DO UPDATE SET
          status = excluded.status,
          expires_at = excluded.expires_at
      `, [student.id, course.id, enrollmentStatus, expiresAt]);
    }

    await database.exec('COMMIT;');
    console.log(`Imported ${rows.length} course enrollment rows from ${resolvedInputPath}`);
  } catch (error) {
    try { await database.exec('ROLLBACK;'); } catch { /* transaction may not have started */ }
    throw error;
  } finally {
    await database.close();
  }
}

importEnrollments().catch((error) => {
  console.error('Enrollment import failed:', error.message);
  process.exit(1);
});
