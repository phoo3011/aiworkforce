const fs = require('fs');
const path = require('path');

const { initializeDatabase, openDatabase } = require('./database');

function validateHttpsUrl(value, label) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https://`);
  return parsed.toString();
}

function normalizeMaterials(value, lessonSlug) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`Materials for lesson '${lessonSlug}' must be an array.`);

  return value.map((material, index) => {
    const title = String(material?.title || '').trim();
    if (!title) throw new Error(`Material ${index + 1} for lesson '${lessonSlug}' needs a title.`);
    return {
      title,
      url: validateHttpsUrl(material?.url, `Material URL for '${title}'`),
      order: index + 1
    };
  });
}

function normalizeLessonInput(lessonInput, courseSlug) {
  const lessonSlug = String(lessonInput.slug || '').trim().toLowerCase();
  const lessonOrder = Number(lessonInput.order);
  const youtubeVideoId = String(lessonInput.youtubeVideoId || '').trim();
  const materials = normalizeMaterials(lessonInput.materials, lessonSlug || 'unknown');

  if (
    !lessonSlug
    || !lessonInput.title
    || !Number.isInteger(lessonOrder)
    || (youtubeVideoId && !/^[A-Za-z0-9_-]{11}$/.test(youtubeVideoId))
    || (!youtubeVideoId && !materials.length)
  ) {
    throw new Error(`Invalid lesson in course '${courseSlug}'.`);
  }

  return { lessonSlug, lessonOrder, youtubeVideoId, materials };
}

async function importContent() {
  let data;
  let sourceLabel = '';

  if (process.env.COURSE_JSON_DATA) {
    data = JSON.parse(process.env.COURSE_JSON_DATA);
    sourceLabel = 'Environment Variable COURSE_JSON_DATA';
  } else {
    const inputPath = process.argv[2];
    if (!inputPath) {
      console.log('No course content JSON provided (via argument or COURSE_JSON_DATA env var). Skipping import.');
      return;
    }
    const resolvedInputPath = path.resolve(inputPath);
    data = JSON.parse(fs.readFileSync(resolvedInputPath, 'utf8'));
    sourceLabel = resolvedInputPath;
  }

  if (!Array.isArray(data.courses)) throw new Error('Content JSON must have a courses array.');

  const database = await openDatabase();
  try {
    await initializeDatabase(database);
    await database.exec('BEGIN IMMEDIATE TRANSACTION;');

    for (const courseInput of data.courses) {
      const courseSlug = String(courseInput.slug || '').trim().toLowerCase();
      if (!courseSlug || !courseInput.title || !Array.isArray(courseInput.lessons)) {
        throw new Error('Each course needs slug, title, and lessons.');
      }

      await database.run(`
        INSERT INTO courses (slug, title, description, active, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(slug) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          active = excluded.active,
          updated_at = CURRENT_TIMESTAMP
      `, [courseSlug, courseInput.title, courseInput.description || '', courseInput.active === false ? 0 : 1]);

      const course = await database.get('SELECT id FROM courses WHERE slug = ?', [courseSlug]);
      for (const lessonInput of courseInput.lessons) {
        const { lessonSlug, lessonOrder, youtubeVideoId, materials } = normalizeLessonInput(lessonInput, courseSlug);

        await database.run(`
          INSERT INTO lessons (
            course_id, slug, title, description, lesson_order, youtube_video_id, active, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(course_id, slug) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            lesson_order = excluded.lesson_order,
            youtube_video_id = excluded.youtube_video_id,
            active = excluded.active,
            updated_at = CURRENT_TIMESTAMP
        `, [
          course.id, lessonSlug, lessonInput.title, lessonInput.description || '', lessonOrder,
          youtubeVideoId, lessonInput.active === false ? 0 : 1
        ]);

        const lesson = await database.get(
          'SELECT id FROM lessons WHERE course_id = ? AND slug = ?',
          [course.id, lessonSlug]
        );

        await database.run('DELETE FROM lesson_materials WHERE lesson_id = ?', [lesson.id]);
        for (const material of materials) {
          await database.run(`
            INSERT INTO lesson_materials (lesson_id, title, material_url, material_order)
            VALUES (?, ?, ?, ?)
          `, [lesson.id, material.title, material.url, material.order]);
        }

        for (const checkpointInput of lessonInput.checkpoints || []) {
          const checkpointKey = String(checkpointInput.key || '').trim().toLowerCase();
          const type = String(checkpointInput.type || '').trim().toLowerCase();
          const triggerAtSeconds = checkpointInput.triggerAtSeconds == null
            ? null
            : Number(checkpointInput.triggerAtSeconds);

          if (!checkpointKey || !['pre_test', 'exercise', 'post_test'].includes(type)) {
            throw new Error(`Invalid checkpoint in lesson '${lessonSlug}'.`);
          }
          if (type === 'exercise' && (!Number.isInteger(triggerAtSeconds) || triggerAtSeconds < 1)) {
            throw new Error(`Exercise '${checkpointKey}' needs a positive triggerAtSeconds.`);
          }

          const googleFormUrl = validateHttpsUrl(
            checkpointInput.googleFormUrl,
            `Google Form URL for '${checkpointKey}'`
          );
          await database.run(`
            INSERT INTO checkpoints (
              lesson_id, checkpoint_key, type, title, trigger_at_seconds, google_form_url, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(lesson_id, checkpoint_key) DO UPDATE SET
              type = excluded.type,
              title = excluded.title,
              trigger_at_seconds = excluded.trigger_at_seconds,
              google_form_url = excluded.google_form_url,
              active = excluded.active
          `, [
            lesson.id, checkpointKey, type, checkpointInput.title || 'แบบทดสอบ', triggerAtSeconds,
            googleFormUrl, checkpointInput.active === false ? 0 : 1
          ]);
        }
      }
    }

    await database.exec('COMMIT;');
    console.log(`Imported course content from ${sourceLabel}`);
  } catch (error) {
    try { await database.exec('ROLLBACK;'); } catch { /* transaction may not have started */ }
    throw error;
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  importContent().catch((error) => {
    console.error('Content import failed:', error.message);
    process.exit(1);
  });
}

module.exports = { normalizeLessonInput, normalizeMaterials };
