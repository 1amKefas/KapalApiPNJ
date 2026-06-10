/**
 * PreVis — i18n (Internationalization) System
 * Handles language translations and text management
 */

// =============================================
// Translations Database
// =============================================
const translations = {
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
  return 'id';
}

/**
 * Set language and save to localStorage
 */
function setLanguage(lang) {
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
