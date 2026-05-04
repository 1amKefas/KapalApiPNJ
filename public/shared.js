/**
 * PreVis — Shared JavaScript
 * API client, auth guard, navbar, utilities
 */

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
        <div class="navbar-logo"></div>
        <span class="navbar-title">PreVis</span>
      </div>
      <div class="navbar-right">
        <a href="/notifications.html" class="notification-bell" id="notif-bell" title="Notifications">
          <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
          <span class="notification-badge" id="notif-count">0</span>
        </a>
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
          <button onclick="logout()">Logout</button>
        </div>
      </div>
    `;
  }

  // Sub navigation
  const subNav = document.getElementById('sub-nav');
  if (subNav) {
    const tabs = [
      { id: 'dashboard', label: 'Dashboard', icon: 'assets/dahsboard_icon.png', href: '/dashboard.html' },
      { id: 'analytics', label: 'Analytics', icon: 'assets/analytic_icon.png', href: '/analytics.html' },
      { id: 'settings', label: 'Settings', icon: 'assets/settings_icon.png', href: '#' },
    ];

    subNav.innerHTML = `
      <div class="nav-tabs">
        ${tabs.map(t => `
          <a href="${t.href}" class="nav-tab ${activePage === t.id ? 'active' : ''}">
            <img src="${t.icon}" alt="${t.label}">
            ${t.label}
          </a>
        `).join('')}
      </div>
      <div class="system-status">
        <span class="status-dot"></span>
        System Status Operational
      </div>
    `;
  }

  // Load notification count
  loadNotificationCount();
}

async function loadNotificationCount() {
  try {
    const data = await api.get('/notifications?status=critical&limit=1');
    const badge = document.getElementById('notif-count');
    if (badge) {
      const count = data.pagination.total;
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  } catch (e) {
    console.warn('Failed to load notification count', e);
  }
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
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

function getStatusClass(alertLevel) {
  if (alertLevel === 'Critical') return 'critical';
  if (alertLevel === 'Warning') return 'warning';
  return 'healthy';
}

function getStatusLabel(alertLevel) {
  if (alertLevel === 'Critical') return 'Critical';
  if (alertLevel === 'Warning') return 'Warning';
  return 'Healthy';
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
