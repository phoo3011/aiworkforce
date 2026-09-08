const express = require('express');
const cors = require('cors');

function parseAllowedOrigins(value) {
  return (value || [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'https://aiworkforcedev.online',
    'https://www.aiworkforcedev.online',
    'https://aiworkforce.turnpro.dev',
    'http://aiworkforce.turnpro.dev'
  ].join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createRateLimiter({ windowMs = 60_000, maxRequests = 120 } = {}) {
  const clients = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = clients.get(key);

    if (!current || current.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > maxRequests) {
      res.status(429).json({
        authorized: false,
        message: 'มีคำขอเข้าระบบมากเกินไป กรุณารอสักครู่แล้วลองใหม่'
      });
      return;
    }
    next();
  };
}

function createApp({ database, verifyIdToken, allowedOrigins, rateLimitOptions } = {}) {
  if (!database) throw new Error('createApp requires a database client');
  if (typeof verifyIdToken !== 'function') throw new Error('createApp requires verifyIdToken');

  const app = express();
  const origins = parseAllowedOrigins(allowedOrigins);

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }
      const error = new Error('Origin is not allowed by CORS');
      error.statusCode = 403;
      callback(error);
    }
  }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', createRateLimiter(rateLimitOptions));

  app.get('/api/health', async (req, res, next) => {
    try {
      await database.get('SELECT 1 AS healthy');
      res.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  async function authenticate(req, res, next) {
    const authorization = req.get('authorization') || '';
    const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
    const idToken = bearerMatch?.[1] || req.body?.idToken;

    if (!idToken) {
      res.status(401).json({ authorized: false, message: 'ไม่พบข้อมูลเข้าสู่ระบบ' });
      return;
    }

    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      res.status(401).json({ authorized: false, message: 'ข้อมูลเข้าสู่ระบบไม่ถูกต้องหรือหมดอายุแล้ว' });
      return;
    }

    try {
      const email = String(decodedToken.email || '').trim().toLowerCase();
      if (!email || decodedToken.email_verified === false) {
        res.status(401).json({ authorized: false, message: 'บัญชีนี้ไม่มีอีเมลที่ยืนยันแล้ว' });
        return;
      }

      const student = await database.get(`
        SELECT id, email, status, firebase_uid, track
        FROM students
        WHERE LOWER(email) = ?
      `, [email]);

      if (!student) {
        res.status(403).json({ authorized: false, message: 'บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ' });
        return;
      }
      if (student.status !== 'active') {
        res.status(403).json({
          authorized: false,
          message: 'บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน'
        });
        return;
      }

      if (decodedToken.uid && student.firebase_uid !== decodedToken.uid) {
        await database.run('UPDATE students SET firebase_uid = ? WHERE id = ?', [decodedToken.uid, student.id]);
        student.firebase_uid = decodedToken.uid;
      }

      req.student = student;
      next();
    } catch (error) {
      next(error);
    }
  }

  async function getStudentCourses(studentId, track) {
    let trackCondition = '';
    if (track === 'dl' || track === 'dt') trackCondition = "AND c.slug IN ('ai-developer', 'core-ai-foundation')";
    else if (track === 'ml' || track === 'mt') trackCondition = "AND c.slug IN ('ai-marketing', 'core-ai-foundation')";

    return database.all(`
      SELECT
        c.id, c.slug, c.title, c.description,
        COUNT(DISTINCT l.id) AS lessonCount,
        COUNT(DISTINCT CASE WHEN p.event_type = 'video_ended' THEN p.lesson_id END) AS completedLessons
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id AND l.active = 1
      LEFT JOIN progress p ON p.lesson_id = l.id AND p.student_id = ?
      WHERE c.active = 1 ${trackCondition}
      GROUP BY c.id
      ORDER BY c.title
    `, [studentId]);
  }

  app.get('/api/me', authenticate, async (req, res, next) => {
    try {
      res.json({ authorized: true, email: req.student.email, track: req.student.track, courses: await getStudentCourses(req.student.id, req.student.track) });
    } catch (error) {
      next(error);
    }
  });

  // Compatibility route for the currently deployed frontend.
  app.post('/api/verify-token', authenticate, async (req, res, next) => {
    try {
      res.json({
        authorized: true,
        email: req.student.email,
        track: req.student.track,
        courses: await getStudentCourses(req.student.id, req.student.track),
        message: 'ยืนยันสิทธิ์สำเร็จ'
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/courses', authenticate, async (req, res, next) => {
    try {
      res.json({ courses: await getStudentCourses(req.student.id, req.student.track) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/courses/:courseSlug/lessons', authenticate, async (req, res, next) => {
    try {
      let trackCondition = '';
      const track = req.student.track;
      if (track === 'dl' || track === 'dt') trackCondition = "AND c.slug IN ('ai-developer', 'core-ai-foundation')";
      else if (track === 'ml' || track === 'mt') trackCondition = "AND c.slug IN ('ai-marketing', 'core-ai-foundation')";

      const course = await database.get(`
        SELECT c.id, c.slug, c.title, c.description
        FROM courses c
        WHERE c.slug = ? AND c.active = 1 ${trackCondition}
      `, [req.params.courseSlug]);

      if (!course) {
        res.status(404).json({ message: 'ไม่พบหลักสูตรนี้หรือหลักสูตรยังไม่เปิดใช้งาน' });
        return;
      }

      const lessons = await database.all(`
        SELECT
          l.id, l.slug, l.title, l.description, l.lesson_order AS lessonOrder,
          COUNT(DISTINCT cp.id) AS checkpointCount,
          MAX(CASE WHEN p.event_type = 'video_started' THEN 1 ELSE 0 END) AS started,
          MAX(CASE WHEN p.event_type = 'video_ended' THEN 1 ELSE 0 END) AS completed
        FROM lessons l
        LEFT JOIN checkpoints cp ON cp.lesson_id = l.id AND cp.active = 1
        LEFT JOIN progress p ON p.lesson_id = l.id AND p.student_id = ?
        WHERE l.course_id = ? AND l.active = 1
        GROUP BY l.id
        ORDER BY l.lesson_order
      `, [req.student.id, course.id]);

      res.json({ course, lessons });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/lessons/:lessonId', authenticate, async (req, res, next) => {
    try {
      let trackCondition = '';
      const track = req.student.track;
      if (track === 'dl' || track === 'dt') trackCondition = "AND c.slug IN ('ai-developer', 'core-ai-foundation')";
      else if (track === 'ml' || track === 'mt') trackCondition = "AND c.slug IN ('ai-marketing', 'core-ai-foundation')";

      const lesson = await database.get(`
        SELECT
          l.id, l.slug, l.title, l.description, l.lesson_order AS lessonOrder,
          l.youtube_video_id AS youtubeVideoId,
          c.slug AS courseSlug, c.title AS courseTitle,
          EXISTS(
            SELECT 1 FROM progress watched
            WHERE watched.student_id = ?
              AND watched.lesson_id = l.id
              AND watched.event_type = 'video_ended'
          ) AS completed
        FROM lessons l
        JOIN courses c ON c.id = l.course_id AND c.active = 1 ${trackCondition}
        WHERE l.id = ? AND l.active = 1
      `, [req.student.id, req.params.lessonId]);

      if (!lesson) {
        res.status(404).json({ message: 'ไม่พบบทเรียนหรือบทเรียนยังไม่เปิดใช้งาน' });
        return;
      }

      const checkpoints = await database.all(`
        SELECT
          cp.id, cp.checkpoint_key AS checkpointKey, cp.type, cp.title,
          cp.trigger_at_seconds AS triggerAtSeconds, cp.google_form_url AS googleFormUrl,
          MAX(CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END) AS opened
        FROM checkpoints cp
        LEFT JOIN progress p
          ON p.checkpoint_id = cp.id AND p.student_id = ? AND p.event_type = 'checkpoint_opened'
        WHERE cp.lesson_id = ? AND cp.active = 1
        GROUP BY cp.id
        ORDER BY CASE cp.type WHEN 'pre_test' THEN 0 WHEN 'exercise' THEN 1 ELSE 2 END,
          cp.trigger_at_seconds
      `, [req.student.id, lesson.id]);

      res.json({ lesson, checkpoints });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/progress', authenticate, async (req, res, next) => {
    try {
      const lessonId = Number(req.body?.lessonId);
      const checkpointId = req.body?.checkpointId == null ? null : Number(req.body.checkpointId);
      const eventType = String(req.body?.eventType || '');
      const allowedEvents = new Set([
        'lesson_opened',
        'video_started',
        'checkpoint_opened',
        'checkpoint_reached',
        'video_ended'
      ]);

      if (!Number.isInteger(lessonId) || !allowedEvents.has(eventType)) {
        res.status(400).json({ message: 'ข้อมูลความคืบหน้าไม่ถูกต้อง' });
        return;
      }

      let trackCondition = '';
      const track = req.student.track;
      if (track === 'dl' || track === 'dt') trackCondition = "AND c.slug IN ('ai-developer', 'core-ai-foundation')";
      else if (track === 'ml' || track === 'mt') trackCondition = "AND c.slug IN ('ai-marketing', 'core-ai-foundation')";

      const access = await database.get(`
        SELECT l.id
        FROM lessons l
        JOIN courses c ON c.id = l.course_id AND c.active = 1 ${trackCondition}
        WHERE l.id = ? AND l.active = 1
      `, [lessonId]);

      if (!access) {
        res.status(404).json({ message: 'ไม่พบบทเรียนหรือบทเรียนยังไม่เปิดใช้งาน' });
        return;
      }

      if (eventType === 'checkpoint_opened' || eventType === 'checkpoint_reached') {
        if (!Number.isInteger(checkpointId)) {
          res.status(400).json({ message: 'กรุณาระบุ checkpoint ที่ถูกต้อง' });
          return;
        }
        const checkpoint = await database.get(
          'SELECT id FROM checkpoints WHERE id = ? AND lesson_id = ? AND active = 1',
          [checkpointId, lessonId]
        );
        if (!checkpoint) {
          res.status(400).json({ message: 'checkpoint ไม่ตรงกับบทเรียนนี้' });
          return;
        }
      }

      const existing = await database.get(`
        SELECT id FROM progress
        WHERE student_id = ? AND lesson_id = ? AND event_type = ?
          AND (checkpoint_id = ? OR (checkpoint_id IS NULL AND ? IS NULL))
      `, [req.student.id, lessonId, eventType, checkpointId, checkpointId]);

      if (!existing) {
        await database.run(
          'INSERT INTO progress (student_id, lesson_id, checkpoint_id, event_type) VALUES (?, ?, ?, ?)',
          [req.student.id, lessonId, checkpointId, eventType]
        );
      }
      res.status(existing ? 200 : 201).json({ saved: true });
    } catch (error) {
      next(error);
    }
  });

  app.use((req, res) => res.status(404).json({ message: 'ไม่พบ API ที่เรียก' }));
  app.use((error, req, res, next) => {
    console.error('API error:', error.message);
    res.status(error.statusCode || 500).json({
      message: error.statusCode === 403
        ? 'เว็บไซต์นี้ไม่ได้รับอนุญาตให้เรียก API'
        : 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง'
    });
  });

  return app;
}

module.exports = { createApp, parseAllowedOrigins };
