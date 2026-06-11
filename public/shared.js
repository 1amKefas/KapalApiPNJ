/**
 * PreVis — Shared JavaScript
 * API client, auth guard, navbar, utilities
 */

// =============================================
// Theme Management
// =============================================

const THEMES = {
  LIGHT: 'Terang',
  DARK: 'Gelap'
};

/**
 * Get current theme from localStorage or system preference
 */
function getCurrentTheme() {
  const saved = localStorage.getItem('previs_theme');
  if (saved) return saved;
  
  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return THEMES.DARK;
  }
  return THEMES.LIGHT;
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
  const root = document.documentElement;
  
  // Accept both 'Gelap' (old format) and 'dark' (settings.js format)
  const isDark = (theme === THEMES.DARK || theme === 'dark');
  
  if (isDark) {
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
    localStorage.setItem('previs_theme', THEMES.DARK);
  } else {
    root.removeAttribute('data-theme');
    root.style.colorScheme = 'light';
    localStorage.setItem('previs_theme', THEMES.LIGHT);
  }
}

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
  const current = getCurrentTheme();
  const newTheme = current === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT;
  applyTheme(newTheme);
  return newTheme;
}

/**
 * Initialize theme on page load
 */
function initializeTheme() {
  const theme = getCurrentTheme();
  applyTheme(theme);
}

// Initialize theme immediately when script loads
initializeTheme();

const API_BASE = '/api';

// =============================================
// API Client
// =============================================
const api = {
  async get(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async post(endpoint, data) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `API error: ${res.status}`);
    }
    return res.json();
  },
};

// =============================================
// Auth
// =============================================
function getUser() {
  const data = localStorage.getItem('previs_user');
  return data ? JSON.parse(data) : null;
}

function setUser(user) {
  localStorage.setItem('previs_user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('previs_user');
  window.location.href = '/login.html';
}

function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  return user;
}

// =============================================
// Navbar Rendering
// =============================================
function renderNavbar(activePage) {
  const user = getUser();
  if (!user) return;

  // Top navbar
  const topNav = document.getElementById('top-navbar');
  if (topNav) {
    topNav.innerHTML = `
      <div class="navbar-brand">
        <img src="assets/logo_previs.png" alt="PreVis Logo" class="logo-image" background="transparent" width="80" height="80">
        <span class="navbar-title">PreVis</span>
      </div>
      <div class="navbar-right">
        <button type="button" class="notification-bell" id="notif-bell" title="Notifikasi" aria-label="Buka notifikasi" aria-expanded="false" onclick="toggleNotificationPopup(event)">
          <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
          <span class="notification-badge" id="notif-count">0</span>
        </button>
        <div class="notification-popup" id="notification-popup" aria-live="polite">
          <div class="notification-popup-header">
            <span>Notifikasi Mesin</span>
            <button type="button" onclick="closeNotificationPopup()" aria-label="Tutup notifikasi">&times;</button>
          </div>
          <div class="notification-popup-list" id="notification-popup-list">
            <div class="notification-popup-empty">Memuat notifikasi...</div>
          </div>
        </div>
        <div class="user-profile" onclick="document.getElementById('logout-menu').classList.toggle('show')">
          <div class="user-avatar">
            <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <div class="user-info">
            <span class="user-name">${user.email || user.username}</span>
            <span class="user-role">${capitalize(user.role)}</span>
          </div>
        </div>
        <div class="logout-menu" id="logout-menu">
          <button onclick="logout()" data-i18n="logout">Keluar</button>
        </div>
      </div>
    `;
  }

  // Sub navigation
  const subNav = document.getElementById('sub-nav');
  if (subNav) {
    const tabs = [
      { id: 'dashboard', label: 'Dasbor', icon: 'assets/dahsboard_icon.png', href: '/dashboard.html' },
      { id: 'analytics', label: 'Analitik', icon: 'assets/analytic_icon.png', href: '/analytics.html' },
      { id: 'costBenefit', label: 'Analisis Biaya & Manfaat', icon: 'assets/cost-benefit_icon.png', href: '/cost-benefit.html' },
      { id: 'settings', label: 'Pengaturan', icon: 'assets/settings_icon.png', href: '/settings.html' },
    ];

    const activeTab = tabs.find(t => t.id === activePage);

    subNav.innerHTML = `
      <button class="mobile-nav-toggle" id="mobile-nav-toggle" aria-label="Menu navigasi" aria-expanded="false">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/>
        </svg>
      </button>
      <div class="nav-tabs" id="main-nav-tabs">
        ${tabs.map(t => `
          <a href="${t.href}" class="nav-tab ${activePage === t.id ? 'active' : ''}">
            <img src="${t.icon}" alt="${t.label}">
            <span data-i18n="${t.id}">${t.label}</span>
          </a>
        `).join('')}
      </div>
      <div class="system-status">
        <span class="status-dot"></span>
        <span data-i18n="systemStatusOperational">Status Sistem Operasional</span>
      </div>
    `;

    // Mobile hamburger toggle
    const toggleBtn = document.getElementById('mobile-nav-toggle');
    const navTabs = document.getElementById('main-nav-tabs');
    if (toggleBtn && navTabs) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = navTabs.classList.toggle('open');
        toggleBtn.setAttribute('aria-expanded', String(isOpen));
      });

      // Close menu when a tab is clicked
      navTabs.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          navTabs.classList.remove('open');
          toggleBtn.setAttribute('aria-expanded', 'false');
        });
      });

      // Close menu on outside click
      document.addEventListener('click', (e) => {
        if (!subNav.contains(e.target)) {
          navTabs.classList.remove('open');
          toggleBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  // Load notification count
  loadNotificationCount();
  startNotificationWatcher();
  
  // Apply translation to navbar elements if translatePage is available
  if (typeof translatePage === 'function') {
    translatePage();
  }
}

async function loadNotificationCount() {
  try {
    const [warningData, criticalData] = await Promise.all([
      api.get('/notifications?status=warning&limit=1'),
      api.get('/notifications?status=critical&limit=1'),
    ]);
    const badge = document.getElementById('notif-count');
    if (badge) {
      const count = (warningData.pagination?.total || 0) + (criticalData.pagination?.total || 0);
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  } catch (e) {
    console.warn('Failed to load notification count', e);
  }
}

let notificationSocket = null;
let notificationWatcherStarted = false;
let notificationPollingTimer = null;
let notificationWatcherPrimed = false;
let knownNotificationIds = new Set(loadKnownNotificationIds());

function loadKnownNotificationIds() {
  try {
    const raw = localStorage.getItem('previs_seen_notifications');
    const values = raw ? JSON.parse(raw) : [];
    return Array.isArray(values) ? values : [];
  } catch (e) {
    return [];
  }
}

function saveKnownNotificationIds() {
  const values = Array.from(knownNotificationIds).slice(-100);
  knownNotificationIds = new Set(values);
  localStorage.setItem('previs_seen_notifications', JSON.stringify(values));
}

function getNotificationId(notification) {
  return String(notification.id || notification.pred_id || `${notification.machine_id}-${notification.timestamp}`);
}

function isActiveNotification(notification) {
  return ['Peringatan', 'Kritis', 'Warning', 'Critical'].includes(notification.status || notification.alert_level);
}

function getNotificationStatusClass(status) {
  if (status === 'Kritis' || status === 'Critical') return 'critical';
  if (status === 'Peringatan' || status === 'Warning') return 'warning';
  return 'healthy';
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

async function getActiveNotifications(limit = 6) {
  const [warningData, criticalData] = await Promise.all([
    api.get(`/notifications?status=warning&limit=${limit}`),
    api.get(`/notifications?status=critical&limit=${limit}`),
  ]);

  return [
    ...(warningData.notifications || []),
    ...(criticalData.notifications || []),
  ]
    .filter(isActiveNotification)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

async function loadNotificationPopup() {
  const list = document.getElementById('notification-popup-list');
  if (!list) return;

  list.innerHTML = '<div class="notification-popup-empty">Memuat notifikasi...</div>';

  try {
    const notifications = await getActiveNotifications(8);

    if (!notifications.length) {
      list.innerHTML = '<div class="notification-popup-empty">Tidak ada peringatan aktif.</div>';
      return;
    }

    list.innerHTML = notifications.map((notification) => {
      const statusClass = getNotificationStatusClass(notification.status);
      return `
        <div class="notification-popup-item ${statusClass}">
          <div class="notification-popup-topline">
            <strong>${escapeHTML(notification.machine_id)}</strong>
            <span class="notification-popup-status ${statusClass}">${escapeHTML(notification.status)}</span>
          </div>
          <div class="notification-popup-title">${escapeHTML(notification.failure_type || 'Anomali mesin')}</div>
          <div class="notification-popup-desc">${escapeHTML(notification.anomaly_description || 'Peringatan dari model machine learning.')}</div>
          <div class="notification-popup-action">${escapeHTML(notification.recommended_action || 'Periksa mesin')}</div>
          <time>${formatDateTime(notification.timestamp)}</time>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="notification-popup-empty">Gagal memuat notifikasi.</div>';
    console.warn('Failed to load notification popup', e);
  }
}

function toggleNotificationPopup(event) {
  event?.stopPropagation();
  const popup = document.getElementById('notification-popup');
  const bell = document.getElementById('notif-bell');
  if (!popup) return;

  const willShow = !popup.classList.contains('show');
  popup.classList.toggle('show', willShow);
  bell?.setAttribute('aria-expanded', String(willShow));

  if (willShow) {
    loadNotificationPopup();
  }
}

function closeNotificationPopup() {
  document.getElementById('notification-popup')?.classList.remove('show');
  document.getElementById('notif-bell')?.setAttribute('aria-expanded', 'false');
}

function showRealtimeNotification(notification) {
  if (!isActiveNotification(notification)) return;

  const statusClass = getNotificationStatusClass(notification.status || notification.alert_level);
  const toast = document.createElement('div');
  toast.className = `live-notification-toast ${statusClass}`;
  toast.innerHTML = `
    <button type="button" class="live-notification-close" aria-label="Tutup">&times;</button>
    <div class="live-notification-kicker">${escapeHTML(notification.status || 'Peringatan')} ML terdeteksi</div>
    <strong>${escapeHTML(notification.machine_id || 'Mesin')}</strong>
    <p>${escapeHTML(notification.anomaly_description || notification.failure_type || 'Model mendeteksi kondisi mesin perlu diperiksa.')}</p>
  `;

  toast.querySelector('button')?.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  window.setTimeout(() => toast.classList.add('show'), 10);
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 250);
  }, 8000);
}

function handleIncomingNotification(notification, shouldToast = true) {
  const id = getNotificationId(notification);
  if (knownNotificationIds.has(id)) return;

  knownNotificationIds.add(id);
  saveKnownNotificationIds();

  if (shouldToast) {
    showRealtimeNotification(notification);
  }

  loadNotificationCount();
  if (document.getElementById('notification-popup')?.classList.contains('show')) {
    loadNotificationPopup();
  }
}

async function pollNotificationUpdates() {
  try {
    const notifications = await getActiveNotifications(10);

    if (!notificationWatcherPrimed) {
      notifications.forEach((notification) => knownNotificationIds.add(getNotificationId(notification)));
      saveKnownNotificationIds();
      notificationWatcherPrimed = true;
      return;
    }

    notifications.reverse().forEach((notification) => handleIncomingNotification(notification, true));
  } catch (e) {
    console.warn('Failed to poll notification updates', e);
  }
}

function connectNotificationSocket() {
  if (!window.io || notificationSocket) return;

  notificationSocket = window.io();
  notificationSocket.on('prediction-notification', (notification) => {
    notificationWatcherPrimed = true;
    handleIncomingNotification(notification, true);
  });
}

function loadSocketClient() {
  if (window.io) {
    connectNotificationSocket();
    return;
  }

  if (document.querySelector('script[data-notification-socket]')) return;

  const script = document.createElement('script');
  script.src = '/socket.io/socket.io.js';
  script.async = true;
  script.dataset.notificationSocket = 'true';
  script.onload = connectNotificationSocket;
  document.head.appendChild(script);
}

function startNotificationWatcher() {
  if (notificationWatcherStarted) return;
  notificationWatcherStarted = true;

  document.addEventListener('click', (event) => {
    const popup = document.getElementById('notification-popup');
    const bell = document.getElementById('notif-bell');
    if (!popup?.classList.contains('show')) return;
    if (popup.contains(event.target) || bell?.contains(event.target)) return;
    closeNotificationPopup();
  });

  loadSocketClient();
  pollNotificationUpdates();
  notificationPollingTimer = window.setInterval(pollNotificationUpdates, 15000);
}

// =============================================
// Utility Functions
// =============================================
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatNumber(num) {
  return new Intl.NumberFormat().format(num);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    year: 'numeric', month: 'short', day: 'numeric',
  }) + ' ' + d.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  });
}

function getStatusClass(alertLevel) {
  if (alertLevel === 'Critical') return 'critical';
  if (alertLevel === 'Warning') return 'warning';
  return 'healthy';
}

function getStatusLabel(alertLevel) {
  if (alertLevel === 'Critical') return 'Kritis';
  if (alertLevel === 'Warning') return 'Peringatan';
  return 'Sehat';
}

function getMachineImage(machineId) {
  // Cycle through 4 machine images based on ID
  const num = parseInt(machineId.replace('M-', ''));
  const imgIndex = ((num - 1) % 4) + 1;
  return `assets/machines/machine-${imgIndex}.png`;
}

function getHealthScore(failureProb) {
  // Convert failure probability (0-1) to health score (0-100)
  return Math.round((1 - (failureProb || 0)) * 100);
}

function getSparklineColor(alertLevel) {
  if (alertLevel === 'Critical') return '#EF4444';
  if (alertLevel === 'Warning') return '#EAB308';
  return '#22C55E';
}
