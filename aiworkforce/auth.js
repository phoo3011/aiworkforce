import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, OAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

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
          alert('เข้าสู่ระบบสำเร็จ: ' + data.message);
        }
        
        // 1. Auto-close the popup modal upon successful login
        window.closeAuthModal();
        
      } else if (response.status === 403 || data.authorized === false) {
        // Unauthorized Access: Email not enrolled or no access
        if (!silent) {
          alert('การเข้าถึงถูกปฏิเสธ: อีเมลนี้ยังไม่ได้ลงทะเบียน หรือไม่มีสิทธิ์เข้าถึงคอร์สเรียนนี้ครับ');
        }
        
        // Automatic Sign-Out
        await signOut(auth);
        
        // UI Reset
        userProfileSection.style.display = 'none';
        loginSection.style.display = 'block';
        userEmailDisplay.textContent = '';
        
      } else {
        // Other unexpected errors
        alert('เกิดข้อผิดพลาด: ' + (data.message || 'ไม่สามารถเข้าสู่ระบบได้'));
        await signOut(auth);
        userProfileSection.style.display = 'none';
        loginSection.style.display = 'block';
        userEmailDisplay.textContent = '';
      }
      
    } catch (error) {
      // Network or Server Errors
      console.error('Network or Backend error:', error);
      alert('ไม่สามารถเชื่อมต่อกับระบบเซิร์ฟเวอร์ได้ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือเซิร์ฟเวอร์');
      
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
      alert('Google Sign-In Failed: ' + error.message);
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
      alert('Microsoft Sign-In Failed: ' + error.message);
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
      alert('Sign-Out Failed: ' + error.message);
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
