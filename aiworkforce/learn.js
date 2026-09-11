import { ApiError, apiFetch, waitForAuthUser } from './auth.js';

const statusPanel = document.getElementById('dashboard-status');
const courseGrid = document.getElementById('course-grid');
const learnerEmail = document.getElementById('learner-email');
const dashboardTitle = document.getElementById('dashboard-title');
const dashboardIntro = document.getElementById('dashboard-intro');
const allCoursesLink = document.getElementById('all-courses-link');
const requestedCourseSlug = new URLSearchParams(window.location.search).get('course');

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function showStatus(message, isError = false) {
  statusPanel.hidden = false;
  statusPanel.classList.toggle('error', isError);
  statusPanel.textContent = message;
}

function lessonState(lesson) {
  if (Number(lesson.completed)) return { text: 'เรียนจบแล้ว', className: 'lesson-state complete' };
  if (Number(lesson.started)) return { text: 'กำลังเรียน', className: 'lesson-state' };
  return { text: 'ยังไม่เริ่ม', className: 'lesson-state' };
}

function renderCourse(course, lessons) {
  const panel = createElement('article', 'course-panel');
  let colorClass = '';
  if (course.slug === 'ai-marketing' || course.slug === 'core-ai-foundation') {
    colorClass = ' foundation';
  }
  
  const head = createElement('header', `course-head${colorClass}`);
  head.append(
    createElement('h2', '', course.title),
    createElement('p', '', course.description || 'หลักสูตรที่พร้อมให้เรียน')
  );
  head.append(createElement(
    'div',
    'progress-copy',
    `${Number(course.completedLessons) || 0} / ${Number(course.lessonCount) || 0} บทเรียนจบแล้ว`
  ));
  panel.append(head);

  if (!lessons.length) {
    panel.append(createElement('p', 'empty-lessons', 'ยังไม่มีบทเรียนเผยแพร่ในหลักสูตรนี้'));
    return panel;
  }

  const list = createElement('ol', 'lesson-list');
  lessons.forEach((lesson) => {
    const item = createElement('li', 'lesson-item');
    const link = createElement('a', 'lesson-link');
    link.href = `lesson.html?lesson=${encodeURIComponent(lesson.id)}`;
    const copy = createElement('div', 'lesson-copy');
    copy.append(
      createElement('strong', '', lesson.title),
      createElement('span', '', `${Number(lesson.checkpointCount) || 0} แบบทดสอบ/กิจกรรม`)
    );
    const state = lessonState(lesson);
    link.append(
      createElement('span', 'lesson-number', String(lesson.lessonOrder)),
      copy,
      createElement('span', state.className, state.text)
    );
    item.append(link);
    list.append(item);
  });
  panel.append(list);
  return panel;
}

async function loadDashboard() {
  try {
    const user = await waitForAuthUser();
    if (!user) {
      learnerEmail.textContent = 'ยังไม่ได้เข้าสู่ระบบ';
      showStatus('กรุณากด Login เพื่อเข้าสู่ระบบก่อนเปิดบทเรียน', true);
      window.openAuthModal();
      return;
    }

    const access = await apiFetch('/api/me', { user });
    learnerEmail.textContent = access.email || user.email;
    if (!access.courses.length) {
      showStatus('ขณะนี้ยังไม่มีหลักสูตรที่เปิดให้เรียน กรุณาลองใหม่ภายหลัง');
      return;
    }

    let coursesToShow = [];
    if (requestedCourseSlug) {
      const selectedCourse = access.courses.find((course) => course.slug === requestedCourseSlug);
      if (!selectedCourse) {
        showStatus('คุณไม่มีสิทธิ์เข้าถึงหลักสูตรนี้ หรือไม่พบหลักสูตรที่ระบุ', true);
        return;
      }
      dashboardTitle.textContent = `บทเรียน ${selectedCourse.title}`;
      dashboardIntro.textContent = `เลือกบทเรียนของหลักสูตร ${selectedCourse.title} เพื่อดูวิดีโอ แบบทดสอบ และความคืบหน้าของคุณ`;
      allCoursesLink.hidden = false;
      coursesToShow = [selectedCourse];
    } else {
      coursesToShow = access.courses;
    }

    const courseResults = await Promise.all(coursesToShow.map(async (course) => {
      const result = await apiFetch(`/api/courses/${encodeURIComponent(course.slug)}/lessons`, { user });
      return { course, lessons: result.lessons };
    }));

    courseGrid.replaceChildren(...courseResults.map(({ course, lessons }) => renderCourse(course, lessons)));
    statusPanel.hidden = true;
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    const message = error instanceof ApiError
      ? error.message
      : 'โหลดข้อมูลบทเรียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    showStatus(message, true);
  }
}

loadDashboard();
