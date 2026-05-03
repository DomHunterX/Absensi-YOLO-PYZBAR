/**
 * Authentication Module
 * Shared authentication logic untuk semua halaman
 */

const AuthModule = (function() {
  const API_BASE = '/api';
  
  /**
   * Get session token from storage or URL
   */
  function getSessionToken() {
    // Check URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
      sessionStorage.setItem('session_token', tokenFromUrl);
      // Clean URL without reloading
      window.history.replaceState({}, document.title, window.location.pathname);
      return tokenFromUrl;
    }
    
    // Check storage
    return localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
  }
  
  /**
   * Clear all authentication data
   */
  function clearAuth() {
    localStorage.removeItem('session_token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('session_token');
    sessionStorage.removeItem('user');
  }
  
  /**
   * Redirect to login page
   */
  function redirectToLogin() {
    window.location.href = '/login';
  }
  
  /**
   * Validate session token with server
   * @returns {Promise<Object|null>} User data if valid, null if invalid
   */
  async function validateSession(token) {
    if (!token) return null;
    
    try {
      const response = await fetch(API_BASE + '/auth/me', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      }
      
      return null;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }
  
  /**
   * Check authentication and validate user role
   * @param {string|string[]} allowedRoles - Role(s) yang diizinkan akses
   * @param {Function} onSuccess - Callback jika auth berhasil, menerima user data
   * @param {Function} onFailure - Optional callback jika auth gagal
   */
  async function requireAuth(allowedRoles, onSuccess, onFailure) {
    const token = getSessionToken();
    
    if (!token) {
      console.log('[AUTH] No token found, redirecting to login');
      if (onFailure) onFailure('no_token');
      redirectToLogin();
      return;
    }
    
    const user = await validateSession(token);
    
    if (!user) {
      console.log('[AUTH] Invalid token, redirecting to login');
      clearAuth();
      if (onFailure) onFailure('invalid_token');
      redirectToLogin();
      return;
    }
    
    // Check role if specified
    if (allowedRoles) {
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      
      if (!roles.includes(user.role)) {
        console.log(`[AUTH] Access denied. Required: ${roles.join('|')}, Got: ${user.role}`);
        if (onFailure) onFailure('access_denied');
        
        // Redirect based on role
        if (user.role === 'mahasiswa') {
          window.location.href = '/mahasiswa';
        } else {
          window.location.href = '/';
        }
        return;
      }
    }
    
    console.log('[AUTH] Authentication successful:', user.username, `(${user.role})`);
    
    // Call success callback with user data
    if (onSuccess) {
      onSuccess(user);
    }
  }
  
  /**
   * API fetch helper with automatic token injection
   */
  async function apiFetch(path, options = {}) {
    const token = getSessionToken();
    
    const headers = {
      ...(options.headers || {})
    };
    
    // Only add Content-Type if not FormData
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(API_BASE + path, {
        ...options,
        headers,
        credentials: 'include'
      });
      
      return response;
    } catch (error) {
      console.error('API fetch error:', error);
      throw error;
    }
  }
  
  /**
   * Logout user
   */
  async function logout() {
    const token = getSessionToken();
    
    if (token) {
      try {
        await fetch(API_BASE + '/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    
    clearAuth();
    redirectToLogin();
  }
  
  // Public API
  return {
    getSessionToken,
    clearAuth,
    redirectToLogin,
    validateSession,
    requireAuth,
    apiFetch,
    logout
  };
})();

// Export untuk digunakan di module lain
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthModule;
}
