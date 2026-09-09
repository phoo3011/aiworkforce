import { ApiError, apiFetch, waitForAuthUser } from './auth.js';
import { createLessonPlayer } from './youtube-player.js';

const lessonStatus = document.getElementById('lesson-status');
const lessonContent = document.getElementById('lesson-content');
const testList = document.getElementById('test-list');
const testPanel = document.querySelector('.test-panel');
const videoCard = document.getElementById('video-card');
const videoUnavailable = document.getElementById('video-unavailable');
const materialsPanel = document.getElementById('materials-panel');
const materialsList = document.getElementById('materials-list');
let player;
let requiresLogin = false;

function lockLessonAfterSignOut() {
  try {
    player?.stopVideo?.();
    player?.destroy?.();
  } catch {
    // The YouTube frame may already have been removed or failed to initialize.
  }
  player = null;
  document.getElementById('youtube-player').replaceChildren();
  testList.replaceChildren();
  materialsList.replaceChildren();
  testPanel.hidden = true;
  materialsPanel.hidden = true;
  videoCard.hidden = false;
  videoUnavailable.hidden = true;
  lessonContent.hidden = true;
  lessonStatus.hidden = false;
  lessonStatus.classList.add('error');
  lessonStatus.textContent = 'คุณออกจากระบบแล้ว กรุณาเข้าสู่ระบบอีกครั้งเพื่อดูบทเรียน';
}

window.addEventListener('aiworkforce:auth-changed', (event) => {
  if (!event.detail) {
    requiresLogin = true;
    lockLessonAfterSignOut();
    return;
  }

  if (requiresLogin) window.location.reload();
});

function getLessonRequest() {
  const params = new URLSearchParams(window.location.search);
  const lessonId = Number(params.get('lesson'));
  if (Number.isInteger(lessonId) && lessonId > 0) return { lessonId };

  const courseSlug = params.get('course');
  const lessonOrder = Number(params.get('lessonOrder'));
  if (courseSlug && Number.isInteger(lessonOrder) && lessonOrder > 0) {
    return { courseSlug, lessonOrder };
  }
  return null;
}

function safeFormUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderMaterials(materials) {
  materialsList.replaceChildren();
  const safeMaterials = materials.filter((material) => safeFormUrl(material.url));
  materialsPanel.hidden = safeMaterials.length === 0;

  safeMaterials.forEach((material) => {
    const link = document.createElement('a');
    link.className = 'material-link';
    link.href = safeFormUrl(material.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const title = document.createElement('strong');
    title.textContent = material.title;
    const action = document.createElement('span');
    action.innerHTML = 'เปิดสไลด์ <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>';
    link.append(title, action);
    materialsList.append(link);
  });
}

function formatTime(seconds) {
  const minutes = Math.floor(Number(seconds) / 60);
  const remainingSeconds = Math.floor(Number(seconds) % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function checkpointDescription(checkpoint) {
  if (checkpoint.type === 'pre_test') return 'แนะนำให้ทำก่อนเริ่มดูวิดีโอ';
  if (checkpoint.type === 'post_test') return 'เปิดได้เมื่อวิดีโอเล่นถึงตอนจบ';
  return `แนะนำให้ทำหลังดูเนื้อหาประมาณนาที ${formatTime(checkpoint.triggerAtSeconds)}`;
}

async function saveProgress(lessonId, eventType, checkpointId = null) {
  try {
    await apiFetch('/api/progress', {
      method: 'POST',
      body: JSON.stringify({ lessonId, eventType, checkpointId })
    });
  } catch (error) {
    console.warn('Progress could not be saved:', error.message);
  }
}

function createFormLink(checkpoint, lessonId, completed) {
  const formUrl = safeFormUrl(checkpoint.googleFormUrl);
  if (!formUrl) return null;

  const link = document.createElement('a');
  link.className = 'form-link';
  link.textContent = 'เปิด Google Form';
  link.href = formUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  if (checkpoint.type === 'post_test' && !completed) {
    link.classList.add('locked');
    link.setAttribute('aria-disabled', 'true');
    link.removeAttribute('href');
    link.dataset.postTest = 'true';
    link.dataset.lockedUrl = formUrl;
    link.dataset.checkpointId = String(checkpoint.id);
  } else {
    link.addEventListener('click', () => {
      saveProgress(lessonId, 'checkpoint_opened', checkpoint.id);
    });
  }

  return link;
}

function renderTests(checkpoints, completed, lessonId) {
  testList.replaceChildren();
  const hasActivities = checkpoints.length > 0;
  testPanel.hidden = !hasActivities;
  lessonContent.classList.toggle('no-activities', !hasActivities);
  if (!hasActivities) return;

  checkpoints.forEach((checkpoint) => {
    const card = document.createElement('section');
    card.className = 'test-card';
    const title = document.createElement('strong');
    title.textContent = checkpoint.title;
    const description = document.createElement('p');
    description.textContent = checkpointDescription(checkpoint);
    card.append(title, description);

    const actions = document.createElement('div');
    actions.className = 'test-actions';

    if (checkpoint.type === 'exercise') {
      const seekButton = document.createElement('button');
      seekButton.className = 'seek-button';
      seekButton.type = 'button';
      seekButton.innerHTML = `<i class="fa-solid fa-play" aria-hidden="true"></i> ไปนาที ${formatTime(checkpoint.triggerAtSeconds)}`;
      seekButton.addEventListener('click', () => {
        if (!player) return;
        player.seekTo(Number(checkpoint.triggerAtSeconds), true);
        player.playVideo();
      });
      actions.append(seekButton);
    }

    const formLink = createFormLink(checkpoint, lessonId, completed);
    if (formLink) actions.append(formLink);
    if (actions.childElementCount) card.append(actions);

    if (Number(checkpoint.opened)) {
      card.append(Object.assign(document.createElement('div'), {
        className: 'activity-opened',
        textContent: 'เคยเปิดกิจกรรมนี้แล้ว'
      }));
    }

    testList.append(card);
  });
}

function unlockPostTests(lessonId, checkpoints) {
  testList.querySelectorAll('[data-post-test="true"]').forEach((link) => {
    link.href = link.dataset.lockedUrl;
    link.classList.remove('locked');
    link.removeAttribute('aria-disabled');
    const checkpoint = checkpoints.find((item) => String(item.id) === link.dataset.checkpointId);
    if (checkpoint) {
      link.addEventListener('click', () => saveProgress(lessonId, 'checkpoint_opened', checkpoint.id), { once: true });
    }
  });
}

async function loadLesson() {
  const lessonRequest = getLessonRequest();
  if (!lessonRequest) {
    lessonStatus.classList.add('error');
    lessonStatus.textContent = 'ลิงก์บทเรียนไม่ถูกต้อง กรุณากลับไปเลือกบทเรียนใหม่';
    return;
  }

  try {
    const user = await waitForAuthUser();
    if (!user) {
      requiresLogin = true;
      lessonStatus.classList.add('error');
      lessonStatus.textContent = 'กรุณาเข้าสู่ระบบก่อนเปิดบทเรียน';
      window.openAuthModal();
      return;
    }

    let lessonId = lessonRequest.lessonId;
    if (!lessonId) {
      const courseResult = await apiFetch(
        `/api/courses/${encodeURIComponent(lessonRequest.courseSlug)}/lessons`,
        { user }
      );
      const matchedLesson = courseResult.lessons.find(
        (lesson) => Number(lesson.lessonOrder) === lessonRequest.lessonOrder
      );
      if (!matchedLesson) {
        lessonStatus.classList.add('error');
        lessonStatus.textContent = 'บทเรียนนี้ยังไม่มีวิดีโอเผยแพร่';
        return;
      }
      lessonId = matchedLesson.id;
    }

    const { lesson, checkpoints, materials = [] } = await apiFetch(`/api/lessons/${lessonId}`, { user });
    document.title = `${lesson.title} | AI Workforce`;
    document.getElementById('course-title').textContent = lesson.courseTitle;
    document.getElementById('lesson-title').textContent = lesson.title;
    document.getElementById('lesson-description').textContent = lesson.description || `บทที่ ${lesson.lessonOrder}`;
    renderTests(checkpoints, Number(lesson.completed), lesson.id);
    renderMaterials(materials);
    videoCard.hidden = !lesson.youtubeVideoId;
    videoUnavailable.hidden = Boolean(lesson.youtubeVideoId);
    lessonStatus.hidden = true;
    lessonContent.hidden = false;

    await saveProgress(lesson.id, 'lesson_opened');
    if (!lesson.youtubeVideoId) return;
    player = await createLessonPlayer({
      elementId: 'youtube-player',
      videoId: lesson.youtubeVideoId,
      onReady(readyPlayer) {
        player = readyPlayer;
      },
      onStarted() {
        saveProgress(lesson.id, 'video_started');
      },
      onEnded() {
        unlockPostTests(lesson.id, checkpoints);
        saveProgress(lesson.id, 'video_ended');
      }
    });
  } catch (error) {
    lessonStatus.classList.add('error');
    lessonStatus.textContent = error instanceof ApiError
      ? error.message
      : 'โหลดบทเรียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  }
}

loadLesson();
