/**
 * PreVis — Settings Manager
 * Handles user preferences
 */

// =============================================
// Settings Page
// =============================================

/**
 * Initialize settings page
 */
function initSettings() {
  renderThemeSettings();
  renderAccountSettings();
  attachEventListeners();
}

/**
 * Render theme selector with toggle switch
 */
function renderThemeSettings() {
  const container = document.getElementById('theme-settings');
  if (!container) return;
  
  const currentTheme = getCurrentTheme();
  
  container.innerHTML = `
    <div class="settings-section">
      <div class="section-header">
        <h3 data-i18n="theme">Theme</h3>
        <p data-i18n="themeDescription">Choose between light and dark theme</p>
      </div>
      <div class="theme-options">
        <div class="theme-preview light-preview">
          <div class="preview-content">
            <div class="preview-bar"></div>
            <div class="preview-card"></div>
            <div class="preview-card"></div>
          </div>
          <label class="theme-label">
            <input 
              type="radio" 
              name="theme" 
              value="light"
              ${currentTheme === THEMES.LIGHT ? 'checked' : ''}
              onchange="changeTheme('light')"
            >
            <span data-i18n="lightTheme">Light Theme</span>
          </label>
        </div>
        
        <div class="theme-preview dark-preview">
          <div class="preview-content">
            <div class="preview-bar"></div>
            <div class="preview-card"></div>
            <div class="preview-card"></div>
          </div>
          <label class="theme-label">
            <input 
              type="radio" 
              name="theme" 
              value="dark"
              ${currentTheme === THEMES.DARK ? 'checked' : ''}
              onchange="changeTheme('dark')"
            >
            <span data-i18n="darkTheme">Dark Theme</span>
          </label>
        </div>
      </div>
      <div class="current-selection">
        <span data-i18n="currentTheme">Current Theme: </span>
        <strong id="current-theme-display">${currentTheme === THEMES.LIGHT ? 'Light' : 'Dark'}</strong>
      </div>
    </div>
  `;
  
  translatePage();
}

/**
 * Render account information
 */
function renderAccountSettings() {
  const container = document.getElementById('account-settings');
  if (!container) return;
  
  const user = getUser();
  if (!user) return;
  
  container.innerHTML = `
    <div class="settings-section">
      <div class="section-header">
        <h3 data-i18n="account">Account</h3>
      </div>
      <div class="account-info">
        <div class="info-row">
          <span class="info-label" data-i18n="email">Email</span>
          <span class="info-value">${user.email || user.username || '—'}</span>
        </div>
        <div class="info-row">
          <span class="info-label" data-i18n="role">Role</span>
          <span class="info-value">${capitalize(user.role) || '—'}</span>
        </div>
        <div class="info-row">
          <span class="info-label" data-i18n="joinDate">Member Since</span>
          <span class="info-value">${formatDate(user.created_at) || '—'}</span>
        </div>
      </div>
    </div>
  `;
  
  translatePage();
}

// =============================================
// Event Handlers
// =============================================

/**
 * Change theme and update UI
 */
function changeTheme(theme) {
  applyTheme(theme);
  
  // Update current theme display
  const display = document.getElementById('current-theme-display');
  if (display) {
    display.textContent = theme === THEMES.LIGHT ? 'Light' : 'Dark';
  }
  
  showNotification('Theme changed successfully', 'success');
}

/**
 * Get current page identifier
 */
function getCurrentPage() {
  const path = window.location.pathname;
  if (path.includes('dashboard')) return 'dashboard';
  if (path.includes('analytics')) return 'analytics';
  if (path.includes('settings')) return 'settings';
  if (path.includes('notifications')) return 'notifications';
  return 'dashboard';
}

/**
 * Show notification message
 */
function showNotification(message, type = 'info') {
  // Create notification element
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.textContent = message;
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    background: ${type === 'success' ? '#22C55E' : '#3B5FE6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999;
    animation: slideInRight 0.3s ease;
  `;
  
  document.body.appendChild(notif);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    notif.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addListener((e) => {
      if (!localStorage.getItem('previs_theme')) {
        applyTheme(e.matches ? THEMES.DARK : THEMES.LIGHT);
        renderThemeSettings();
      }
    });
  }
}
