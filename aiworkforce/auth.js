import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

const firebaseConfig = {
  apiKey: 'AIzaSyAoaNtLUmoqJJERrERyj6779U0HqroEjoo',
  authDomain: 'aiworkforce.turnpro.dev',
  projectId: 'project---aiworkforce',
  storageBucket: 'project---aiworkforce.firebasestorage.app',
  messagingSenderId: '260846006624',
  appId: '1:260846006624:web:53df28f07f1dbf6cf42e05'
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getApiBaseUrl() {
  return String(window.AI_WORKFORCE_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
}

export function waitForAuthUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function apiFetch(path, options = {}) {
  const user = options.user || auth.currentUser;
  if (!user) throw new ApiError('กรุณาเข้าสู่ระบบก่อน', 401);

  const idToken = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${idToken}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });
  } catch {
    throw new ApiError('เชื่อมต่อระบบบทเรียนไม่ได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์เปิดอยู่', 0);
  }
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new ApiError(data.message || 'ไม่สามารถเชื่อมต่อระบบบทเรียนได้', response.status);
  return data;
}

window.openAuthModal = function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeAuthModal = function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
};

function friendlyAuthError(error) {
  const messages = {
    'auth/account-exists-with-different-credential': 'อีเมลนี้เคยเข้าสู่ระบบด้วยผู้ให้บริการอื่น กรุณาใช้วิธีเดิม',
    'auth/popup-closed-by-user': 'คุณปิดหน้าต่างเข้าสู่ระบบก่อนดำเนินการเสร็จ',
    'auth/network-request-failed': 'เชื่อมต่อเครือข่ายไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
    'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต popup แล้วลองใหม่'
  };
  return messages[error.code] || 'ไม่สามารถยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง';
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('auth-modal')) return;

  // Auto-update lesson icons based on syllabus
  fetch(`${getApiBaseUrl()}/api/public/syllabus`)
    .then(res => res.json())
    .then(data => {
      const syllabus = data.syllabus || [];
      document.querySelectorAll('a.lesson-access').forEach(a => {
        try {
          const url = new URL(a.href, window.location.origin);
          const course = url.searchParams.get('course');
          const lessonOrder = Number(url.searchParams.get('lessonOrder'));
          const lessonData = syllabus.find(s => s.courseSlug === course && s.lessonOrder === lessonOrder);
          
          if (lessonData) {
            const icon = a.querySelector('i');
            if (icon) {
              // Update icon: Play for video, File for document
              icon.className = lessonData.hasVideo ? 'fa-solid fa-play' : 'fa-solid fa-file-lines';
            }
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      });
    })
    .catch(err => console.error('Failed to load syllabus icons:', err));

  document.body.insertAdjacentHTML('beforeend', `
    <div class="auth-overlay" id="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div id="login-container" class="auth-wrapper">
        <button class="auth-close" type="button" aria-label="ปิด" onclick="window.closeAuthModal()">×</button>
        <h2 class="auth-heading" id="auth-title">เข้าสู่ระบบ</h2>
        <p class="auth-description">เข้าสู่ระบบด้วยอีเมลที่ลงทะเบียนไว้กับโครงการ</p>
        <button id="btn-login-google" class="auth-btn btn-google" type="button">
          <svg class="provider-logo" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.842 2.078-1.796 2.716v2.258h2.909c1.702-1.567 2.683-3.873 2.683-6.614z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.909-2.258c-.806.54-1.837.859-3.047.859-2.344 0-4.328-1.584-5.037-3.71H.956v2.332A9 9 0 009 18z"/>
            <path fill="#FBBC05" d="M3.963 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.281-1.71V4.958H.956A9 9 0 000 9c0 1.452.348 2.827.956 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.44 1.345l2.581-2.581C13.463.891 11.428 0 9 0A9 9 0 00.956 4.958L3.963 7.29C4.672 5.164 6.656 3.58 9 3.58z"/>
          </svg>
          เข้าสู่ระบบด้วย Google
        </button>
        <button id="btn-login-microsoft" class="auth-btn btn-microsoft" type="button">
          <svg class="provider-logo" viewBox="0 0 23 23" aria-hidden="true" focusable="false">
            <path fill="#F25022" d="M1 1h10v10H1z"/>
            <path fill="#7FBA00" d="M12 1h10v10H12z"/>
            <path fill="#00A4EF" d="M1 12h10v10H1z"/>
            <path fill="#FFB900" d="M12 12h10v10H12z"/>
          </svg>
          เข้าสู่ระบบด้วย Microsoft
        </button>
      </div>

      <div id="logged-in-container" class="auth-wrapper" style="display:none">
        <button class="auth-close" type="button" aria-label="ปิด" onclick="window.closeAuthModal()">×</button>
        <h2 class="auth-heading">บัญชีของฉัน</h2>
        <p class="user-info">เข้าสู่ระบบด้วย <span id="user-email-display" class="user-email"></span></p>

        <button id="btn-logout" class="auth-btn btn-logout" type="button">ออกจากระบบ</button>
      </div>
    </div>
  `);

  const loginSection = document.getElementById('login-container');
  const profileSection = document.getElementById('logged-in-container');
  const emailDisplay = document.getElementById('user-email-display');
  let interactiveLogin = false;
  let currentAccess = null;

  function updateTrackVisibility(access) {
    document.body.classList.remove('track-dl', 'track-dt', 'track-ml', 'track-all');
    if (!access) {
      document.querySelectorAll('.lesson-access, .lesson-unavailable').forEach((el) => {
        el.style.removeProperty('display');
      });
      return;
    }

    const track = (access.track || 'all').toLowerCase();
    document.body.classList.add(`track-${track}`);

    const allowedSlugs = new Set((access.courses || []).map((c) => c.slug));

    // Filter a.lesson-access based on ?course= parameter
    document.querySelectorAll('a.lesson-access').forEach((link) => {
      try {
        const url = new URL(link.href, window.location.origin);
        const course = url.searchParams.get('course');
        if (course) {
          const isAllowed = track === 'all' || allowedSlugs.has(course);
          if (!isAllowed) {
            link.style.setProperty('display', 'none', 'important');
          } else {
            link.style.removeProperty('display');
          }
        }
      } catch {
        // Ignore invalid URL
      }
    });

    // Filter track container blocks (e.g. data-track="dl", data-track="dt", etc.)
    document.querySelectorAll('[data-track]').forEach((container) => {
      const containerTrack = container.getAttribute('data-track')?.toLowerCase();
      if (!containerTrack || containerTrack === 'foundation') return;

      const isAllowed = track === 'all' || track === containerTrack;
      container.querySelectorAll('.lesson-access, .lesson-unavailable').forEach((btn) => {
        if (!isAllowed) {
          btn.style.setProperty('display', 'none', 'important');
        } else {
          btn.style.removeProperty('display');
        }
      });
    });
  }

  function setNavUser(email) {
    document.querySelectorAll('.btn-login-nav').forEach((button) => {
      button.replaceChildren();
      if (email) {
        const icon = document.createElement('i');
        icon.className = 'fa-regular fa-user';
        icon.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.className = 'nav-email-text';
        span.textContent = email;
        button.append(icon, span);
      } else {
        button.textContent = 'Login';
      }
    });
  }

  function showSignedOut() {
    currentAccess = null;
    loginSection.style.display = 'block';
    profileSection.style.display = 'none';
    emailDisplay.textContent = '';
    setNavUser('');
    document.body.classList.remove('logged-in');
    updateTrackVisibility(null);
  }

  function showSignedIn(email) {
    loginSection.style.display = 'none';
    profileSection.style.display = 'block';
    emailDisplay.textContent = email;
    setNavUser(email);
    document.body.classList.add('logged-in');
  }

  async function beginPopupLogin(provider) {
    interactiveLogin = true;
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      interactiveLogin = false;
      await Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: friendlyAuthError(error),
        confirmButtonColor: '#d33'
      });
    }
  }

  document.getElementById('btn-login-google').addEventListener('click', () => {
    beginPopupLogin(new GoogleAuthProvider());
  });
  document.getElementById('btn-login-microsoft').addEventListener('click', () => {
    beginPopupLogin(new OAuthProvider('microsoft.com'));
  });
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut(auth);
    window.closeAuthModal();
  });
  document.getElementById('auth-modal').addEventListener('click', (event) => {
    if (event.target.id === 'auth-modal') window.closeAuthModal();
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showSignedOut();
      window.dispatchEvent(new CustomEvent('aiworkforce:auth-changed', { detail: null }));
      return;
    }

    try {
      const access = await apiFetch('/api/me', { user });
      currentAccess = access;
      showSignedIn(access.email || user.email);
      updateTrackVisibility(access);
      window.dispatchEvent(new CustomEvent('aiworkforce:auth-changed', { detail: access }));

      if (interactiveLogin) {
        interactiveLogin = false;
        window.closeAuthModal();
        await Swal.fire({
          icon: 'success',
          title: 'เข้าสู่ระบบสำเร็จ',
          text: access.courses.length
            ? 'คุณสามารถเข้าสู่บทเรียนที่ได้รับสิทธิ์ได้แล้ว'
            : 'บัญชีนี้ผ่านการยืนยันแล้ว แต่ยังไม่ได้รับสิทธิ์หลักสูตร',
          confirmButtonColor: '#0d9488'
        });
      }
    } catch (error) {
      const shouldNotify = interactiveLogin;
      interactiveLogin = false;
      await signOut(auth);
      showSignedOut();

      if (shouldNotify) {
        await Swal.fire({
          icon: 'error',
          title: 'ยังไม่สามารถเข้าใช้งานได้',
          text: error.message,
          confirmButtonColor: '#d33'
        });
      }
    }
  });
});
