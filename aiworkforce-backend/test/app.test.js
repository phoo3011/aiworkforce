const assert = require('node:assert/strict');
const test = require('node:test');

const { createApp } = require('../app');
const { initializeDatabase, openDatabase } = require('../database');

async function createTestContext(t) {
  const database = await openDatabase(':memory:');
  await initializeDatabase(database);

  const verifyIdToken = async (token) => {
    if (token === 'invalid') throw new Error('Invalid token');
    return {
      uid: `uid-${token}`,
      email: `${token}@example.com`,
      email_verified: true
    };
  };

  const app = createApp({
    database,
    verifyIdToken,
    allowedOrigins: 'http://localhost:5500',
    rateLimitOptions: { maxRequests: 1_000 }
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  return { database, baseUrl };
}

async function addStudent(database, name, status = 'active') {
  const result = await database.run(
    'INSERT INTO students (email, status) VALUES (?, ?)',
    [`${name}@example.com`, status]
  );
  return result.lastID;
}

async function apiRequest(baseUrl, path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

test('health endpoint reports that the API and database are ready', async (t) => {
  const { baseUrl } = await createTestContext(t);
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('protected endpoints reject missing and invalid tokens', async (t) => {
  const { baseUrl } = await createTestContext(t);

  const missing = await apiRequest(baseUrl, '/api/me');
  const invalid = await apiRequest(baseUrl, '/api/me', 'invalid');

  assert.equal(missing.status, 401);
  assert.equal(invalid.status, 401);
});

test('students with an inactive account are denied', async (t) => {
  const { database, baseUrl } = await createTestContext(t);
  await addStudent(database, 'inactive', 'inactive');

  const response = await apiRequest(baseUrl, '/api/me', 'inactive');
  assert.equal(response.status, 403);
});

test('active students without enrollment can sign in but see no courses', async (t) => {
  const { database, baseUrl } = await createTestContext(t);
  await addStudent(database, 'active');

  const response = await apiRequest(baseUrl, '/api/me', 'active');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.authorized, true);
  assert.deepEqual(body.courses, []);
});

test('students only see lessons in their enrolled course', async (t) => {
  const { database, baseUrl } = await createTestContext(t);
  const studentId = await addStudent(database, 'developer');
  const developerCourse = await database.get("SELECT id FROM courses WHERE slug = 'ai-developer'");
  await database.run(
    "INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, 'active')",
    [studentId, developerCourse.id]
  );
  await database.run(`
    INSERT INTO lessons (course_id, slug, title, lesson_order, youtube_video_id)
    VALUES (?, 'intro', 'Introduction', 1, 'video123')
  `, [developerCourse.id]);

  const allowed = await apiRequest(baseUrl, '/api/courses/ai-developer/lessons', 'developer');
  const denied = await apiRequest(baseUrl, '/api/courses/ai-marketing/lessons', 'developer');
  const allowedBody = await allowed.json();

  assert.equal(allowed.status, 200);
  assert.equal(allowedBody.lessons.length, 1);
  assert.equal(denied.status, 403);
});

test('progress is saved once and only for an accessible lesson', async (t) => {
  const { database, baseUrl } = await createTestContext(t);
  const studentId = await addStudent(database, 'learner');
  const developerCourse = await database.get("SELECT id FROM courses WHERE slug = 'ai-developer'");
  const marketingCourse = await database.get("SELECT id FROM courses WHERE slug = 'ai-marketing'");
  await database.run(
    "INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, 'active')",
    [studentId, developerCourse.id]
  );
  const allowedLesson = await database.run(`
    INSERT INTO lessons (course_id, slug, title, lesson_order, youtube_video_id)
    VALUES (?, 'allowed', 'Allowed lesson', 1, 'video1')
  `, [developerCourse.id]);
  const deniedLesson = await database.run(`
    INSERT INTO lessons (course_id, slug, title, lesson_order, youtube_video_id)
    VALUES (?, 'denied', 'Denied lesson', 1, 'video2')
  `, [marketingCourse.id]);

  const payload = JSON.stringify({ lessonId: allowedLesson.lastID, eventType: 'video_started' });
  const first = await apiRequest(baseUrl, '/api/progress', 'learner', { method: 'POST', body: payload });
  const duplicate = await apiRequest(baseUrl, '/api/progress', 'learner', { method: 'POST', body: payload });
  const denied = await apiRequest(baseUrl, '/api/progress', 'learner', {
    method: 'POST',
    body: JSON.stringify({ lessonId: deniedLesson.lastID, eventType: 'video_started' })
  });
  const row = await database.get('SELECT COUNT(*) AS count FROM progress');

  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 200);
  assert.equal(denied.status, 403);
  assert.equal(row.count, 1);
});

test('opening an optional exercise is recorded without requiring video playback', async (t) => {
  const { database, baseUrl } = await createTestContext(t);
  const studentId = await addStudent(database, 'activity');
  const course = await database.get("SELECT id FROM courses WHERE slug = 'ai-developer'");
  await database.run(
    "INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, 'active')",
    [studentId, course.id]
  );
  const lesson = await database.run(`
    INSERT INTO lessons (course_id, slug, title, lesson_order, youtube_video_id)
    VALUES (?, 'optional-activity', 'Optional activity', 1, 'video123')
  `, [course.id]);
  const checkpoint = await database.run(`
    INSERT INTO checkpoints (
      lesson_id, checkpoint_key, type, title, trigger_at_seconds, google_form_url
    ) VALUES (?, 'exercise-one', 'exercise', 'Exercise one', 480, 'https://docs.google.com/forms/d/example/viewform')
  `, [lesson.lastID]);

  const response = await apiRequest(baseUrl, '/api/progress', 'activity', {
    method: 'POST',
    body: JSON.stringify({
      lessonId: lesson.lastID,
      checkpointId: checkpoint.lastID,
      eventType: 'checkpoint_opened'
    })
  });
  const lessonResponse = await apiRequest(baseUrl, `/api/lessons/${lesson.lastID}`, 'activity');
  const lessonBody = await lessonResponse.json();

  assert.equal(response.status, 201);
  assert.equal(lessonResponse.status, 200);
  assert.equal(Number(lessonBody.checkpoints[0].opened), 1);
});
