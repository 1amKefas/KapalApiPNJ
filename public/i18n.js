/**
 * PreVis — i18n (Internationalization) System
 * Handles language translations and text management
 */

// =============================================
// Translations Database
// =============================================
const translations = {
  en: {
    // Navbar
    dashboard: 'Dashboard',
    analytics: 'Analytics',
    costBenefit: 'Cost Benefit Analysis',
    settings: 'Settings',
    notifications: 'Notifications',
    logout: 'Logout',
    systemStatusOperational: 'System Status Operational',

    // Settings Page
    settingsTitle: 'Settings',
    generalSettings: 'General Settings',
    appearanceSettings: 'Appearance Settings',
    
    // Language Section
    language: 'Language',
    languageDescription: 'Choose your preferred language',
    english: 'English',
    mandarin: 'Mandarin (中文)',
    indonesian: 'Indonesian (Bahasa Indonesia)',
    currentLanguage: 'Current Language: ',
    
    // Theme Section
    theme: 'Theme',
    themeDescription: 'Choose between light and dark theme',
    lightTheme: 'Light Theme',
    darkTheme: 'Dark Theme',
    currentTheme: 'Current Theme: ',
    
    // Account Section
    account: 'Account',
    accountSettings: 'Account Settings',
    email: 'Email',
    role: 'Role',
    joinDate: 'Member Since',
    changePassword: 'Change Password',
    twoFactorAuth: '2FA Authentication',
    
    // Notifications Section
    notificationSettings: 'Notification Settings',
    emailNotifications: 'Email Notifications',
    pushNotifications: 'Push Notifications',
    criticalAlerts: 'Critical Alerts',
    warningAlerts: 'Warning Alerts',
    enabled: 'Enabled',
    disabled: 'Disabled',
    
    // Buttons
    save: 'Save Changes',
    cancel: 'Cancel',
    reset: 'Reset to Defaults',
    
    // Status Messages
    settingsSaved: 'Settings saved successfully!',
    settingsError: 'Error saving settings',
    languageChanged: 'Language changed to',
    themeChanged: 'Theme changed to',
  },
  
  zh: {
    // 导航栏
    dashboard: '仪表板',
    analytics: '分析',
    settings: '设置',
    notifications: '通知',
    logout: '登出',
    systemStatusOperational: '系统状态 正常运行',

    // 设置页面
    settingsTitle: '设置',
    generalSettings: '常规设置',
    appearanceSettings: '外观设置',
    
    // 语言部分
    language: '语言',
    languageDescription: '选择您的首选语言',
    english: '英文',
    mandarin: '中文 (Mandarin)',
    indonesian: '印尼文 (Bahasa Indonesia)',
    currentLanguage: '当前语言：',
    
    // 主题部分
    theme: '主题',
    themeDescription: '在浅色和深色主题之间选择',
    lightTheme: '浅色主题',
    darkTheme: '深色主题',
    currentTheme: '当前主题：',
    
    // 账户部分
    account: '账户',
    accountSettings: '账户设置',
    email: '电子邮件',
    role: '角色',
    joinDate: '加入日期',
    changePassword: '更改密码',
    twoFactorAuth: '2FA 身份验证',
    
    // 通知部分
    notificationSettings: '通知设置',
    emailNotifications: '电子邮件通知',
    pushNotifications: '推送通知',
    criticalAlerts: '关键警报',
    warningAlerts: '警告警报',
    enabled: '已启用',
    disabled: '已禁用',
    
    // 按钮
    save: '保存更改',
    cancel: '取消',
    reset: '重置为默认值',
    
    // 状态消息
    settingsSaved: '设置保存成功！',
    settingsError: '保存设置时出错',
    languageChanged: '语言已更改为',
    themeChanged: '主题已更改为',
  },
  
  id: {
    // Navbar
    dashboard: 'Dasbor',
    analytics: 'Analitik',
    settings: 'Pengaturan',
    notifications: 'Notifikasi',
    logout: 'Keluar',
    systemStatusOperational: 'Status Sistem Operasional',

    // Halaman Pengaturan
    settingsTitle: 'Pengaturan',
    generalSettings: 'Pengaturan Umum',
    appearanceSettings: 'Pengaturan Tampilan',
    
    // Bagian Bahasa
    language: 'Bahasa',
    languageDescription: 'Pilih bahasa pilihan Anda',
    english: 'Bahasa Inggris',
    mandarin: 'Mandarin (中文)',
    indonesian: 'Bahasa Indonesia',
    currentLanguage: 'Bahasa Saat Ini: ',
    
    // Bagian Tema
    theme: 'Tema',
    themeDescription: 'Pilih antara tema terang dan gelap',
    lightTheme: 'Tema Terang',
    darkTheme: 'Tema Gelap',
    currentTheme: 'Tema Saat Ini: ',
    
    // Bagian Akun
    account: 'Akun',
    accountSettings: 'Pengaturan Akun',
    email: 'Email',
    role: 'Peran',
    joinDate: 'Anggota Sejak',
    changePassword: 'Ubah Kata Sandi',
    twoFactorAuth: 'Autentikasi 2FA',
    
    // Bagian Notifikasi
    notificationSettings: 'Pengaturan Notifikasi',
    emailNotifications: 'Notifikasi Email',
    pushNotifications: 'Notifikasi Push',
    criticalAlerts: 'Peringatan Kritis',
    warningAlerts: 'Peringatan Peringatan',
    enabled: 'Diaktifkan',
    disabled: 'Dinonaktifkan',
    
    // Tombol
    save: 'Simpan Perubahan',
    cancel: 'Batal',
    reset: 'Atur Ulang ke Default',
    
    // Pesan Status
    settingsSaved: 'Pengaturan berhasil disimpan!',
    settingsError: 'Kesalahan saat menyimpan pengaturan',
    languageChanged: 'Bahasa diubah menjadi',
    themeChanged: 'Tema diubah menjadi',
  }
};

// =============================================
// i18n API
// =============================================

/**
 * Get current language from localStorage or default to 'en'
 */
function getCurrentLanguage() {
  return localStorage.getItem('previs_language') || 'en';
}

/**
 * Set language and save to localStorage
 */
function setLanguage(lang) {
  if (translations[lang]) {
    localStorage.setItem('previs_language', lang);
    return true;
  }
  return false;
}

/**
 * Get translated text
 * @param {string} key - Translation key
 * @param {string} lang - Language code (defaults to current language)
 * @returns {string} Translated text or key if not found
 */
function t(key, lang = null) {
  const language = lang || getCurrentLanguage();
  return translations[language]?.[key] || key;
}

/**
 * Translate all elements with data-i18n attribute
 */
function translatePage() {
  const lang = getCurrentLanguage();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang]?.[key]) {
      el.textContent = translations[lang][key];
    }
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[lang]?.[key]) {
      el.placeholder = translations[lang][key];
    }
  });
}

/**
 * Get available languages
 */
function getAvailableLanguages() {
  return [
    { code: 'en', label: 'English' },
    { code: 'zh', label: '中文 (Mandarin)' },
    { code: 'id', label: 'Bahasa Indonesia' }
  ];
}

/**
 * Initialize i18n system on page load
 */
function initializeI18n() {
  const savedLang = getCurrentLanguage();
  document.documentElement.lang = savedLang;
  translatePage();
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeI18n);
} else {
  initializeI18n();
}
