import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, OAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAoaNtLUmoqJJERrERyj6779U0HqroEjoo",
  authDomain: "project---aiworkforce.firebaseapp.com",
  projectId: "project---aiworkforce",
  storageBucket: "project---aiworkforce.firebasestorage.app",
  messagingSenderId: "260846006624",
  appId: "1:260846006624:web:53df28f07f1dbf6cf42e05"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Expose modal functions to the global window object (since this is a module)
window.openAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
  const authHtml = `
    <div class="auth-overlay" id="auth-modal">
      <!-- Login State Container -->
      <div id="login-container" class="auth-wrapper">
        <button style="position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #999;" onclick="window.closeAuthModal()"><i class="fa-solid fa-xmark"></i></button>
        <h2 class="auth-heading">Login</h2>
        <button id="btn-login-google" class="auth-btn btn-google">
          <i class="fa-brands fa-google"></i> Login with Google
        </button>
        <button id="btn-login-microsoft" class="auth-btn btn-microsoft">
          <i class="fa-brands fa-windows"></i> Login with Microsoft
        </button>
      </div>

      <!-- Logged-in State Container (Hidden by default) -->
      <div id="logged-in-container" class="auth-wrapper" style="display: none;">
        <button style="position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #999;" onclick="window.closeAuthModal()"><i class="fa-solid fa-xmark"></i></button>
        <h2 class="auth-heading">Welcome Back</h2>
        <p class="user-info">
          Logged in as: <span id="user-email-display" class="user-email"></span>
        </p>
        <button id="btn-logout" class="auth-btn btn-logout">
          Logout
        </button>
      </div>
    </div>
  `;

  // Inject modal into body
  document.body.insertAdjacentHTML('beforeend', authHtml);

  // DOM Elements
  const loginSection = document.getElementById('login-container');
  const userProfileSection = document.getElementById('logged-in-container');
  const btnGoogle = document.getElementById('btn-login-google');
  const btnMicrosoft = document.getElementById('btn-login-microsoft');
  const btnLogout = document.getElementById('btn-logout');
  const userEmailDisplay = document.getElementById('user-email-display');

  // Helper function to translate Firebase auth errors into professional Thai
  function getFriendlyErrorMessage(error) {
    if (error.code === 'auth/account-exists-with-different-credential') {
      return 'อีเมลนี้ถูกผูกไว้กับบัญชีผู้ให้บริการอื่นแล้ว (เช่น คุณอาจเคยล็อกอินด้วย Google) กรุณาใช้วิธีการเดิมในการเข้าสู่ระบบ';
    } else if (error.code === 'auth/popup-closed-by-user') {
      return 'ผู้ใช้งานยกเลิกหน้าต่างการเข้าสู่ระบบก่อนที่จะเสร็จสิ้นกระบวนการ';
    } else if (error.code === 'auth/network-request-failed') {
      return 'เกิดปัญหาการเชื่อมต่อเครือข่าย กรุณาตรวจสอบอินเทอร์เน็ตและลองใหม่อีกครั้ง';
    } else {
      return 'ไม่สามารถยืนยันตัวตนได้: ' + (error.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
    }
  }

  // Helper function for backend authorization
  async function verifyTokenWithBackend(idToken, user, silent = false) {
    try {
      const response = await fetch('http://localhost:5000/api/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ idToken })
      });

      const data = await response.json();

      if (response.ok && data.authorized) {
        // Success: User is authorized
        loginSection.style.display = 'none';
        userProfileSection.style.display = 'block';
        userEmailDisplay.textContent = user.email;
        
        // 2. Change the Login button at the top right to the user's email
        const navBtn = document.querySelector('.btn-login-nav');
        if (navBtn) {
          navBtn.innerHTML = `<i class="fa-regular fa-user" style="margin-right: 6px;"></i> ${user.email}`;
        }

        if (!silent) {
          Swal.fire({
            icon: 'success',
            title: 'เข้าสู่ระบบสำเร็จ',
            text: data.message,
            confirmButtonColor: '#3085d6'
          });
        }
        
        // 1. Auto-close the popup modal upon successful login
        window.closeAuthModal();
        
      } else if (response.status === 403 || data.authorized === false) {
        // Unauthorized Access: Email not enrolled or no access
        if (!silent) {
          Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์การเข้าถึง',
            text: 'บัญชีอีเมลของคุณยังไม่ได้ลงทะเบียนในระบบ หรือไม่มีสิทธิ์เข้าถึงเนื้อหานี้ กรุณาติดต่อผู้ดูแลระบบ',
            confirmButtonColor: '#d33'
          });
        }
        
        // Automatic Sign-Out
        await signOut(auth);
        
        // UI Reset
        userProfileSection.style.display = 'none';
        loginSection.style.display = 'block';
        userEmailDisplay.textContent = '';
        
      } else {
        // Other unexpected errors
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: data.message || 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง',
          confirmButtonColor: '#d33'
        });
        await signOut(auth);
        userProfileSection.style.display = 'none';
        loginSection.style.display = 'block';
        userEmailDisplay.textContent = '';
      }
      
    } catch (error) {
      // Network or Server Errors
      console.error('Network or Backend error:', error);
      Swal.fire({
        icon: 'error',
        title: 'ข้อผิดพลาดในการเชื่อมต่อ',
        text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ตของคุณและลองใหม่อีกครั้ง',
        confirmButtonColor: '#d33'
      });
      
      // Automatic Sign-Out and UI Reset
      await signOut(auth);
      userProfileSection.style.display = 'none';
      loginSection.style.display = 'block';
      userEmailDisplay.textContent = '';
    }
  }

  // Login with Google
  btnGoogle.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      console.log('Google ID Token:', idToken); // Crucial for backend verification
      
      // Verify token with backend
      await verifyTokenWithBackend(idToken, result.user);
    } catch (error) {
      console.error('Error during Google sign-in:', error);
      Swal.fire({
        icon: 'error',
        title: 'การเข้าสู่ระบบด้วย Google ล้มเหลว',
        text: getFriendlyErrorMessage(error),
        confirmButtonColor: '#d33'
      });
    }
  });

  // Login with Microsoft
  btnMicrosoft.addEventListener('click', async () => {
    const provider = new OAuthProvider('microsoft.com');
    try {
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      console.log('Microsoft ID Token:', idToken); // Crucial for backend verification
      
      // Verify token with backend
      await verifyTokenWithBackend(idToken, result.user);
    } catch (error) {
      console.error('Error during Microsoft sign-in:', error);
      Swal.fire({
        icon: 'error',
        title: 'การเข้าสู่ระบบด้วย Microsoft ล้มเหลว',
        text: getFriendlyErrorMessage(error),
        confirmButtonColor: '#d33'
      });
    }
  });

  // Logout
  btnLogout.addEventListener('click', async () => {
    try {
      await signOut(auth);
      
      // Revert UI state
      userProfileSection.style.display = 'none';
      loginSection.style.display = 'block';
      userEmailDisplay.textContent = '';
      
      const navBtn = document.querySelector('.btn-login-nav');
      if (navBtn) {
        navBtn.textContent = 'Login';
      }
      
      window.closeAuthModal();
    } catch (error) {
      console.error('Error during sign-out:', error);
      Swal.fire({
        icon: 'error',
        title: 'การออกจากระบบล้มเหลว',
        text: 'เกิดข้อผิดพลาด: ' + error.message,
        confirmButtonColor: '#d33'
      });
    }
  });

  // Listen for auth state changes to persist login across page reloads
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is signed in, verify token with backend silently (no alert popup)
      const idToken = await user.getIdToken();
      await verifyTokenWithBackend(idToken, user, true);
    } else {
      // User is signed out
      const navBtn = document.querySelector('.btn-login-nav');
      if (navBtn) {
        navBtn.textContent = 'Login';
      }
      userProfileSection.style.display = 'none';
      loginSection.style.display = 'block';
    }
  });
});
