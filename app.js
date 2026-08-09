const APP_VERSION = '2026.08.09.248';
const ANDROID_APK_URL = 'https://github.com/Vetmaster/sporx-futbol-okulu/releases/download/v1.0.22-beta/SASA-F-v1.0.22-beta.apk';
const INSTALL_PROMPT_DISMISS_KEY = 'sasa_install_prompt_dismissed_v1';
const NATIVE_VERSION_STORAGE_KEY = 'sasa_native_version_code';
const ANDROID_APP_LAST_SEEN_STORAGE_KEY = 'sasa_android_app_last_seen';
const ANDROID_APP_SEEN_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const PUSH_PREFERENCE_STORAGE_KEY = 'sasa_phone_notifications';
const PUSH_PROMPT_DISMISS_STORAGE_KEY = 'sasa_push_prompt_dismissed_v1';
const ANDROID_PACKAGE_ID = 'com.sasafutbol.yonetim';
const SUPABASE_URL = 'https://tezeflsiljqprrqbsypl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_b8NKvXEXTLAOz2o1L8XN9w_QQVuMUJx';
const AUTH_REDIRECT_URL = 'https://vetmaster.github.io/sporx-futbol-okulu/';
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const remoteDataStore = supabaseClient && window.SasaSupabaseData?.create(supabaseClient);
const initialFragmentParameters = new URLSearchParams(window.location.hash.slice(1));
const NATIVE_FCM_TOKEN = initialFragmentParameters.get('nativeFcmToken') || '';
const NATIVE_NOTIFICATION_PERMISSION = initialFragmentParameters.get('nativeNotificationPermission') || '';
const authCallbackType = initialFragmentParameters.get('type');
let authMode = ['invite', 'recovery'].includes(authCallbackType) ? 'set-password' : 'login';
let authRequestPending = false;
let signedOutMessage = '';
let openDashboardAfterPasswordLogin = false;
const PAYMENT_METHODS = { cash: 'Nakit', transfer: 'Havale', card: 'Kredi kartı' };
const SUBSCRIPTION_PLANS = {
  standard: { name: 'Standart', price: 799, studentLimit: 100, features: ['100 öğrenciye kadar kayıt', 'Temel okul yönetimi'], unavailable: ['Online ödeme'] },
  premium: { name: 'Premium', price: 1299, studentLimit: 500, features: ['500 öğrenciye kadar kayıt', 'Online ödeme', 'Öğrenci performans değerlendirme'], unavailable: ['Online market', 'Scout video paylaşımı'] },
  pro: { name: 'Pro', price: 1899, studentLimit: null, features: ['Sınırsız öğrenci kaydı', 'Online ödeme', 'Öğrenci performans değerlendirme', 'Online market', 'Scoutlarla video paylaşımı'], unavailable: [] }
};
const SUBSCRIPTION_STATUSES = { trial: 'Deneme', active: 'Aktif', past_due: 'Ödeme bekliyor', suspended: 'Askıda', cancelled: 'İptal edildi' };
const ACCOUNTING_PERIODS = [
  { id: 'today', label: 'Bugün', type: 'days', value: 1 },
  { id: '7d', label: 'Son 7 gün', type: 'days', value: 7 },
  { id: '2w', label: 'Son 2 hafta', type: 'days', value: 14 },
  { id: '1m', label: 'Son 1 ay', type: 'months', value: 1 },
  { id: '3m', label: 'Son 3 ay', type: 'months', value: 3 },
  { id: '6m', label: 'Son 6 ay', type: 'months', value: 6 },
  { id: '1y', label: 'Son 1 yıl', type: 'years', value: 1 }
];
const savedAccountingPeriod = window.localStorage.getItem('sporx_accounting_period');
const NAVIGATION_STORAGE_KEY = 'sasa_navigation_state';
const BROWSER_NAVIGATION_STATE_KEY = 'sasaAppNavigation';
const SELECTED_SCHOOL_STORAGE_KEY = 'sasa_selected_school_id';
const localData = window.SporXDB.load();
const state = {
  role: 'admin',
  actualRole: 'admin',
  schoolId: null,
  schoolName: '',
  schoolSubscriptionPlan: 'standard',
  schools: [],
  userId: null,
  userFullName: '',
  userEmail: '',
  page: 'dashboard',
  pageHistory: [],
  students: localData.students,
  trainings: localData.trainings,
  accountingEntries: localData.accountingEntries,
  notifications: localData.notifications,
  attendanceRecords: localData.attendanceRecords,
  accessRequests: [],
  activeTrainingId: null,
  selectedStudentId: null,
  selectedParentStudentId: null,
  activeStudentsOnly: true,
  debtStudentsOnly: false,
  studentSortKey: 'enrollmentDate',
  studentSortDirection: 'desc',
  monthlyFeeSortKey: 'period',
  monthlyFeeSortDirection: 'desc',
  monthlyFeeUnpaidOnly: false,
  expandedTimelineStudentId: null,
  trainingSortDirection: 'desc',
  attendanceSortDirection: 'desc',
  showPastTrainings: false,
  showPastAttendance: false,
  feeFilter: 'all',
  feeListSortKey: 'enrollmentDate',
  feeListSortDirection: 'desc',
  accountingFilter: 'all',
  accountingPeriod: ACCOUNTING_PERIODS.some(period => period.id === savedAccountingPeriod) ? savedAccountingPeriod : '1m',
  monthlyFeeAmount: 1500,
  pushStatus: 'checking',
  pushBusy: false,
  nativeFcmToken: NATIVE_FCM_TOKEN,
  nativeNotificationPermission: NATIVE_NOTIFICATION_PERMISSION,
  notificationComposeOpen: false,
  notificationDraft: { audience: 'Tüm kullanıcılar', title: '', body: '' },
  editingStudentId: null,
  editingGroupName: null,
  invitingSchoolId: null,
  editingSchoolId: null,
  editingSubscriptionSchoolId: null,
  groupSettingsOpen: false,
  newestGroupPinned: false,
  newestGroupName: '',
  editingTrainingId: null,
  editingAccountingEntryId: null
};
const notificationReadIdsInFlight = new Set();
let browserNavigationReady = false;

const MENU_ICONS = {
  schools: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M8 10h1M12 10h1M16 10h1M8 13h1M12 13h1M16 13h1"></path></svg>',
  student: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"></path></svg>',
  training: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V3M7 4l10 3-10 4M4 21h8"></path></svg>',
  accounting: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2"></rect><path d="M8 6h8v4H8zM8.5 14h1M12 14h1M15.5 14h1M8.5 18h1M12 18h1M15.5 18h1"></path></svg>',
  attendance: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3"></rect><path d="m7.5 12 3 3 6-7"></path></svg>',
  notifications: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path></svg>',
  approvedToggle: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6.5" width="19" height="11" rx="5.5"></rect><circle cx="16" cy="12" r="3"></circle><path d="m6.5 12 1.4 1.4 2.6-3"></path></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>',
  subscriptions: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3 9h18M7 14h4M16 13v3M14.5 14.5h3"></path></svg>'
};

const BASE_GROUPS = ['Saat 09:00', 'Saat 10:00', 'Saat 11:00', 'Saat 12:00', 'U11', 'U12', 'U13', 'U14'];
let GROUPS = [...new Set([...BASE_GROUPS, ...localData.students.map(student => student.group).filter(Boolean)])];

function persistLocalData() {
  window.SporXDB.save({
    students: state.students,
    trainings: state.trainings,
    accountingEntries: state.accountingEntries,
    notifications: state.notifications,
    attendanceRecords: state.attendanceRecords
  });
}

const navItems = {
  dashboard: { label: 'Genel Bakış', icon: '⌂', roles: ['super_admin', 'admin', 'coach', 'parent'] },
  schools: { label: 'Okullar', icon: MENU_ICONS.schools, roles: ['super_admin'] },
  subscriptions: { label: 'Paket ve Abonelik', icon: MENU_ICONS.subscriptions, roles: ['super_admin'] },
  students: { label: 'Öğrenciler', icon: MENU_ICONS.student, roles: ['super_admin', 'admin', 'coach'] },
  studentSettings: { label: 'Öğrenci Ayarları', icon: MENU_ICONS.settings, roles: ['super_admin', 'admin'], hidden: true },
  studentProfile: { label: 'Öğrenci Profili', icon: '◎', roles: ['super_admin', 'admin', 'coach', 'parent'], hidden: true },
  studentAttendanceHistory: { label: 'Öğrenci Yoklamaları', icon: '✓', roles: ['super_admin', 'admin', 'coach', 'parent'], hidden: true },
  child: { label: 'Öğrenci', icon: MENU_ICONS.student, roles: ['parent'] },
  trainings: { label: 'Antrenman', icon: MENU_ICONS.training, roles: ['super_admin', 'admin', 'coach', 'parent'] },
  attendance: { label: 'Yoklama', icon: MENU_ICONS.attendance, roles: ['super_admin', 'admin', 'coach'] },
  fees: { label: 'Aidat', icon: '₺', roles: ['super_admin', 'admin', 'parent'] },
  accounting: { label: 'Muhasebe', icon: MENU_ICONS.accounting, roles: ['super_admin', 'admin'] },
  accountingSettings: { label: 'Muhasebe Ayarları', icon: MENU_ICONS.settings, roles: ['super_admin', 'admin'], hidden: true },
  accountingEntries: { label: 'Son İşlemler', icon: '↗', roles: ['super_admin', 'admin'], hidden: true },
  userApprovals: { label: 'Kullanıcı Onayları', icon: MENU_ICONS.approvedToggle, roles: ['super_admin'] },
  notifications: { label: 'Bildirimler', icon: MENU_ICONS.notifications, roles: ['super_admin', 'admin', 'coach', 'parent'] }
};

const roleNames = { super_admin: 'Süper Admin', admin: 'Admin', coach: 'Antrenör', parent: 'Veli' };
const pageMeta = {
  dashboard: ['Genel Bakış', 'Kulübün bugünkü durumu'], schools: ['Okullar', 'Tüm futbol okullarını tek ekrandan yönetin'], subscriptions: ['Paket ve Abonelik', 'Okulların paket ve abonelik durumları'], students: ['Öğrenciler', 'Kayıtlar ve öğrenci profilleri'], studentSettings: ['Öğrenci Ayarları', 'Antrenman gruplarını yönetin'], studentProfile: ['Öğrenci Profili', 'Öğrenci bilgileri ve antrenman durumu'], studentAttendanceHistory: ['Öğrenci Yoklamaları', 'Geldiği ve gelmediği antrenmanlar'], child: ['Öğrenci', 'Öğrenci profili ve güncel durum'],
  trainings: ['Antrenman', 'Antrenman takvimi ve gruplar'], attendance: ['Yoklama', 'Antrenman katılım takibi'], fees: ['Aidat', 'Aylık ödeme ve tahsilat takibi'],
  accounting: ['Muhasebe', 'Temel gelir ve gider takibi'], accountingSettings: ['Muhasebe Ayarları', 'Aylık aidat tutarı ve tahakkuk ayarları'], accountingEntries: ['Son İşlemler', 'Tüm gelir ve gider kayıtları'], userApprovals: ['Kullanıcı Onayları', 'Yeni kullanıcıların erişim talepleri'], notifications: ['Bildirimler', 'Duyurular ve gönderim merkezi']
};

function persistNavigationState() {
  if (!state.userId) return;
  window.sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({
    userId: state.userId,
    page: state.page,
    selectedStudentId: state.selectedStudentId,
    selectedParentStudentId: state.selectedParentStudentId,
    feeFilter: state.feeFilter,
    accountingFilter: state.accountingFilter,
    trainingSortDirection: state.trainingSortDirection,
    attendanceSortDirection: state.attendanceSortDirection
  }));
}

function restoreNavigationState(userId) {
  let savedState;
  try {
    savedState = JSON.parse(window.sessionStorage.getItem(NAVIGATION_STORAGE_KEY) || 'null');
  } catch {
    window.sessionStorage.removeItem(NAVIGATION_STORAGE_KEY);
    return;
  }
  if (!savedState || savedState.userId !== userId) return;

  state.page = navItems[savedState.page]?.roles.includes(state.role) ? savedState.page : 'dashboard';
  state.selectedStudentId = Number(savedState.selectedStudentId) || null;
  state.selectedParentStudentId = Number(savedState.selectedParentStudentId) || state.students[0]?.id || null;
  state.feeFilter = ['all', 'pending'].includes(savedState.feeFilter) ? savedState.feeFilter : 'all';
  state.accountingFilter = ['all', 'income', 'expense'].includes(savedState.accountingFilter) ? savedState.accountingFilter : 'all';
  state.trainingSortDirection = savedState.trainingSortDirection === 'asc' ? 'asc' : 'desc';
  state.attendanceSortDirection = savedState.attendanceSortDirection === 'asc' ? 'asc' : 'desc';

  if (['studentProfile', 'studentAttendanceHistory'].includes(state.page) && !state.students.some(student => Number(student.id) === state.selectedStudentId)) {
    state.page = state.role === 'parent' ? 'child' : 'students';
    state.selectedStudentId = null;
  }
}

function navigationSnapshot() {
  return {
    page: state.page,
    selectedStudentId: state.selectedStudentId,
    selectedParentStudentId: state.selectedParentStudentId,
    feeFilter: state.feeFilter,
    accountingFilter: state.accountingFilter
  };
}

function browserNavigationState(snapshot = navigationSnapshot(), pageHistory = state.pageHistory) {
  return {
    ...(window.history.state || {}),
    [BROWSER_NAVIGATION_STATE_KEY]: {
      snapshot,
      pageHistory: pageHistory.map(item => ({ ...item }))
    }
  };
}

function initializeBrowserNavigation() {
  browserNavigationReady = false;
  const currentSnapshot = navigationSnapshot();
  const dashboardSnapshot = { ...currentSnapshot, page: 'dashboard' };
  state.pageHistory = [];
  window.history.replaceState(browserNavigationState(dashboardSnapshot, []), document.title);

  if (currentSnapshot.page !== 'dashboard') {
    state.pageHistory = [dashboardSnapshot];
    window.history.pushState(browserNavigationState(currentSnapshot, state.pageHistory), document.title);
  }
  browserNavigationReady = true;
}

function restoreBrowserNavigation(eventState) {
  const browserState = eventState?.[BROWSER_NAVIGATION_STATE_KEY];
  if (!browserState?.snapshot || !navItems[browserState.snapshot.page]?.roles.includes(state.role)) return false;
  Object.assign(state, browserState.snapshot);
  state.pageHistory = Array.isArray(browserState.pageHistory)
    ? browserState.pageHistory.map(item => ({ ...item }))
    : [];
  document.querySelector('#sidebar').classList.remove('open');
  render();
  if (state.page === 'notifications') {
    refreshPushStatus(true);
    markAllNotificationsRead();
  }
  return true;
}

function navigateToPage(page, updates = {}) {
  const targetPage = navItems[page]?.roles.includes(state.role) ? page : 'dashboard';
  const pageChanged = targetPage !== state.page;
  if (pageChanged) {
    state.pageHistory.push(navigationSnapshot());
    if (state.pageHistory.length > 30) state.pageHistory.shift();
  }
  if (pageChanged && targetPage === 'studentSettings') state.groupSettingsOpen = false;
  Object.assign(state, updates);
  state.page = targetPage;
  document.querySelector('#sidebar').classList.remove('open');
  render();
  if (pageChanged && browserNavigationReady) {
    window.history.pushState(browserNavigationState(), document.title);
  }
  if (targetPage === 'notifications') {
    refreshPushStatus(true);
    markAllNotificationsRead();
  }
}

function requestAppBack() {
  if (state.page === 'dashboard') return;
  if (browserNavigationReady && window.history.state?.[BROWSER_NAVIGATION_STATE_KEY]) {
    window.history.back();
    return;
  }
  goBack();
}

function goBack() {
  const previous = state.pageHistory.pop();
  if (previous && navItems[previous.page]?.roles.includes(state.role)) {
    Object.assign(state, previous);
  } else {
    state.page = 'dashboard';
  }
  document.querySelector('#sidebar').classList.remove('open');
  render();
}

const appShell = document.querySelector('#appShell');
const authScreen = document.querySelector('#authScreen');
const appContent = document.querySelector('#appContent');
const mainNav = document.querySelector('#mainNav');
const bottomNav = document.querySelector('#bottomNav');
const globalBackButton = document.querySelector('#globalBackButton');
const loginForm = document.querySelector('#loginForm');
const loginEmail = document.querySelector('#loginEmail');
const loginPassword = document.querySelector('#loginPassword');
const loginPasswordConfirm = document.querySelector('#loginPasswordConfirm');
const signupFullName = document.querySelector('#signupFullName');
const loginSubmitButton = document.querySelector('#loginSubmitButton');
const authMessage = document.querySelector('#authMessage');
const installPrompt = document.querySelector('#installPrompt');
const installAppButton = document.querySelector('#installAppButton');
const appUpdatePrompt = document.querySelector('#appUpdatePrompt');
const appUpdatePromptDescription = document.querySelector('#appUpdatePromptDescription');
let pendingUpdateUrl = ANDROID_APK_URL;
let deferredInstallPrompt = null;

function runsAsInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function shouldOfferAndroidInstall() {
  return /Android/i.test(window.navigator.userAgent)
    && !runsInAndroidAppShell()
    && !runsAsInstalledApp()
    && !window.localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY);
}

function markAndroidAppAsSeen() {
  window.localStorage.setItem(ANDROID_APP_LAST_SEEN_STORAGE_KEY, String(Date.now()));
}

function wasAndroidAppRecentlySeen() {
  if (Number(window.localStorage.getItem(NATIVE_VERSION_STORAGE_KEY)) > 0) return true;
  const lastSeenAt = Number(window.localStorage.getItem(ANDROID_APP_LAST_SEEN_STORAGE_KEY));
  return lastSeenAt > 0 && Date.now() - lastSeenAt < ANDROID_APP_SEEN_MAX_AGE_MS;
}

async function isAndroidAppInstalled() {
  if (runsInAndroidAppShell()) {
    markAndroidAppAsSeen();
    return true;
  }
  if (wasAndroidAppRecentlySeen()) return true;
  if (typeof window.navigator.getInstalledRelatedApps !== 'function') return false;
  try {
    const relatedApps = await window.navigator.getInstalledRelatedApps();
    const installed = relatedApps.some(app => app.platform === 'play' && app.id === ANDROID_PACKAGE_ID);
    if (installed) markAndroidAppAsSeen();
    return installed;
  } catch (error) {
    console.warn('Kurulu Android uygulaması kontrol edilemedi:', error);
    return false;
  }
}

async function showAndroidInstallPrompt() {
  if (!shouldOfferAndroidInstall()) return;
  if (await isAndroidAppInstalled()) {
    installPrompt.classList.add('is-hidden');
    return;
  }
  appUpdatePrompt.classList.add('is-hidden');
  installPrompt.classList.remove('is-hidden');
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installAppButton.classList.remove('is-hidden');
  showAndroidInstallPrompt();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installPrompt.classList.add('is-hidden');
});

installAppButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installAppButton.classList.add('is-hidden');
  installPrompt.classList.add('is-hidden');
});

document.querySelector('#downloadApkButton').addEventListener('click', () => {
  window.localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, '1');
  installPrompt.classList.add('is-hidden');
  window.location.assign(ANDROID_APK_URL);
});

document.querySelector('#dismissInstallPrompt').addEventListener('click', () => {
  window.localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, '1');
  installPrompt.classList.add('is-hidden');
});

window.setTimeout(showAndroidInstallPrompt, 1200);

function androidShellVersion() {
  const versionFromLaunchUrl = Number(new URLSearchParams(window.location.search).get('nativeVersion'));
  if (versionFromLaunchUrl > 0) {
    window.localStorage.setItem(NATIVE_VERSION_STORAGE_KEY, String(versionFromLaunchUrl));
    return versionFromLaunchUrl;
  }
  return Number(window.localStorage.getItem(NATIVE_VERSION_STORAGE_KEY)) || 1;
}

function runsInAndroidAppShell() {
  const launchParameters = new URLSearchParams(window.location.search);
  const explicitlyLaunchedByAndroidShell = launchParameters.get('androidShell') === '1';
  const launchedWithVersion = Number(launchParameters.get('nativeVersion')) > 0;
  const launchedByAndroidPackage = document.referrer.startsWith(`android-app://${ANDROID_PACKAGE_ID}`);
  const legacyNativeLaunch = launchedWithVersion && (launchedByAndroidPackage || runsAsInstalledApp());
  return explicitlyLaunchedByAndroidShell || launchedByAndroidPackage || legacyNativeLaunch;
}

if (runsInAndroidAppShell()) markAndroidAppAsSeen();

function configurePersistentAndroidDownloads() {
  const shouldShow = /Android/i.test(window.navigator.userAgent)
    && !runsInAndroidAppShell()
    && !runsAsInstalledApp();
  document.querySelectorAll('[data-android-apk-download]').forEach(link => {
    link.href = ANDROID_APK_URL;
    link.classList.toggle('is-hidden', !shouldShow);
  });
}

configurePersistentAndroidDownloads();

async function checkForAndroidUpdate() {
  if (!runsInAndroidAppShell()) return;
  try {
    const response = await fetch(`android-version.json?check=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const release = await response.json();
    const latestVersionCode = Number(release.versionCode);
    if (!latestVersionCode || latestVersionCode <= androidShellVersion()) return;
    if (window.sessionStorage.getItem(`sasa_update_dismissed_${latestVersionCode}`)) return;
    pendingUpdateUrl = release.apkUrl || ANDROID_APK_URL;
    appUpdatePrompt.dataset.versionCode = String(latestVersionCode);
    appUpdatePromptDescription.textContent = `${release.versionName || 'Yeni sürüm'} hazır. Güncel özellikler ve yeni logo için uygulamayı güncelleyin.`;
    installPrompt.classList.add('is-hidden');
    appUpdatePrompt.classList.remove('is-hidden');
  } catch (error) {
    console.warn('Android sürüm kontrolü yapılamadı:', error);
  }
}

document.querySelector('#updateAppButton').addEventListener('click', () => {
  appUpdatePrompt.classList.add('is-hidden');
  if (runsInAndroidAppShell() && androidShellVersion() >= 18) {
    window.location.assign(`sasaf://update?url=${encodeURIComponent(pendingUpdateUrl)}`);
    return;
  }
  window.location.assign(pendingUpdateUrl);
});

document.querySelector('#dismissUpdatePrompt').addEventListener('click', () => {
  const versionCode = appUpdatePrompt.dataset.versionCode;
  if (versionCode) window.sessionStorage.setItem(`sasa_update_dismissed_${versionCode}`, '1');
  appUpdatePrompt.classList.add('is-hidden');
});

window.setTimeout(checkForAndroidUpdate, 1500);

function syncGroupOptions() {
  document.querySelectorAll('select[name="group"]').forEach(select => {
    const selectedGroup = select.value;
    select.replaceChildren(new Option('Seçiniz', ''), ...GROUPS.map(group => new Option(group, group)));
    if (GROUPS.includes(selectedGroup)) select.value = selectedGroup;
  });
}
syncGroupOptions();
document.querySelector('#headerVersionLabel').textContent = `v${APP_VERSION}`;
document.querySelector('#authVersionLabel').textContent = `v${APP_VERSION}`;

function allowedItems() { return Object.entries(navItems).filter(([, item]) => item.roles.includes(state.role) && !item.hidden); }
function isAdminRole() { return ['super_admin', 'admin'].includes(state.role); }
function isCoachRole() { return state.role === 'coach'; }
function isActualSuperAdmin() { return state.actualRole === 'super_admin'; }
function isRolePreview() { return isActualSuperAdmin() && state.role !== 'super_admin'; }
function initials(name) { return name.split(' ').map(part => part[0]).slice(0, 2).join(''); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character])); }
function statusLabel(fee) {
  if (fee === 'paid') return '<span class="status">Ödendi</span>';
  if (fee === 'late') return '<span class="status danger">Ödenmedi</span>';
  if (fee === 'none') return '<span class="status blue">Aidat yok</span>';
  if (fee === 'exempt') return '<span class="status blue">Muaf</span>';
  if (fee === 'unknown') return '<span class="status blue">Kaynak notu</span>';
  return '<span class="status warning">Bekliyor</span>';
}
function formatCurrency(value) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value); }
function localDateValue(date = new Date()) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); }
function studentBirthInputValue(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = String(value).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}
function formatStudentBirthDate(value) { const [year, month, day] = String(value).split('-'); return year && month && day ? `${day}.${month}.${year}` : value; }
function studentBirthYearLabel(student) {
  const year = String(student?.birth || '').match(/(?:19|20)\d{2}/)?.[0];
  return year ? `${year} doğumlu` : 'Doğum yılı belirtilmedi';
}
function feeMonthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function formatFeeMonth(key) { const [year, month] = String(key).split('-').map(Number); return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)); }
function upcomingFeeMonths(count = 6) {
  const cursor = new Date();
  cursor.setDate(1);
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(cursor.getFullYear(), cursor.getMonth() + index, 1);
    return feeMonthKey(month);
  });
}
function formatFeeDueDate(key) {
  const [year, month] = String(key).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(lastDay).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}
function formatEnrollmentDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : value; }
function monthlyFeePeriods(student) {
  const feeStartDate = student.feeTrackingStartDate || student.enrollmentDate;
  const enrollmentDate = /^\d{4}-\d{2}-\d{2}$/.test(feeStartDate) ? feeStartDate : '2026-07-01';
  const [startYear, startMonth] = enrollmentDate.split('-').map(Number);
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date();
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const cursor = start > endMonth ? endMonth : start;
  const periods = [];
  while (cursor <= endMonth) {
    periods.push(feeMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const historicalPeriods = Object.keys(student.feeHistory || {}).filter(month => /^\d{4}-\d{2}$/.test(month));
  return [...new Set([...periods, ...historicalPeriods])].sort().reverse();
}
function monthlyFeeStatus(student, month) {
  if (student.feePayments?.[month]) return student.feePayments[month] === 'pending' ? 'none' : student.feePayments[month];
  if (student.feeHistory?.[month]?.status) return student.feeHistory[month].status === 'pending' ? 'none' : student.feeHistory[month].status;
  return 'none';
}
function currentFeeStatus(student) { return monthlyFeeStatus(student, feeMonthKey()); }
function isActiveStudent(student) { return ['late', 'paid'].includes(currentFeeStatus(student)); }
function unpaidFeePeriods(student) { return monthlyFeePeriods(student).filter(month => monthlyFeeStatus(student, month) === 'late'); }
function monthlyFeeAmount(student, month) {
  const historicalAmount = student.feeHistory?.[month]?.amount;
  return Number.isFinite(Number(historicalAmount)) && historicalAmount !== null ? Number(historicalAmount) : state.monthlyFeeAmount;
}
function feeAccountingReference(student, month) { return `fee:${student.id}:${month}`; }
function removeFeeAccountingEntry(student, month) {
  const reference = feeAccountingReference(student, month);
  state.accountingEntries = state.accountingEntries.filter(entry => entry.reference !== reference);
}
function addFeeAccountingEntry(student, month, paymentDetails = {}) {
  const reference = feeAccountingReference(student, month);
  const amount = Number(paymentDetails.amount) > 0 ? Number(paymentDetails.amount) : monthlyFeeAmount(student, month);
  const paymentDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDetails.paymentDate || '') ? paymentDetails.paymentDate : localDateValue();
  const paymentMethod = PAYMENT_METHODS[paymentDetails.paymentMethod] ? paymentDetails.paymentMethod : 'cash';
  const existingEntry = state.accountingEntries.find(entry => entry.reference === reference);
  const accountingEntry = {
    id: existingEntry?.id || Date.now(),
    date: paymentDate,
    title: `${student.name} · ${formatFeeMonth(month)} aidatı`,
    type: 'Gelir',
    amount,
    kind: 'income',
    paymentMethod,
    source: 'fee',
    reference,
    studentId: student.id,
    feeMonth: month
  };
  if (existingEntry) Object.assign(existingEntry, accountingEntry);
  else state.accountingEntries.unshift(accountingEntry);
}
function setMonthlyFeeStatus(student, month, status, paymentDetails = {}) {
  const amount = status === 'none'
    ? null
    : Number(paymentDetails.amount) > 0
      ? Number(paymentDetails.amount)
      : monthlyFeeAmount(student, month);
  const paymentDate = status === 'paid'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(paymentDetails.paymentDate || '') ? paymentDetails.paymentDate : localDateValue())
    : null;
  const paymentMethod = status === 'paid' && PAYMENT_METHODS[paymentDetails.paymentMethod] ? paymentDetails.paymentMethod : status === 'paid' ? 'cash' : null;
  student.feePayments = { ...student.feePayments, [month]: status };
  student.feeHistory = {
    ...student.feeHistory,
    [month]: {
      ...(student.feeHistory?.[month] || {}),
      status,
      amount,
      note: status === 'none' ? 'Aidat yok' : null,
      paymentMethod,
      paidAt: paymentDate ? `${paymentDate}T12:00:00.000Z` : null,
      createdAt: student.feeHistory?.[month]?.createdAt || new Date().toISOString(),
      source: 'app'
    }
  };
  if (month === feeMonthKey()) student.fee = status;
  if (status === 'paid') addFeeAccountingEntry(student, month, { ...paymentDetails, amount, paymentDate, paymentMethod });
  else removeFeeAccountingEntry(student, month);
}
function feeStatusControl(student, month, status) {
  const selectValue = status === 'none' ? 'none' : 'late';
  return `<select class="fee-status-select" data-monthly-fee-status data-id="${student.id}" data-month="${month}" aria-label="${formatFeeMonth(month)} aidat durumu"><option value="none" ${selectValue === 'none' ? 'selected' : ''}>Aidat yok</option><option value="late" ${selectValue === 'late' ? 'selected' : ''}>Ödenmedi</option></select>`;
}
function monthlyFeeSortHeader(key, label) {
  const active = state.monthlyFeeSortKey === key;
  const direction = active ? state.monthlyFeeSortDirection : 'none';
  const indicator = active ? state.monthlyFeeSortDirection === 'asc' ? '↑' : '↓' : '↕';
  return `<th aria-sort="${direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}"><button class="table-sort-button" type="button" data-action="monthly-fee-sort" data-sort-key="${key}"><span>${label}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;
}
function monthlyFeeSortValue(student, month, key) {
  if (key === 'amount') return monthlyFeeStatus(student, month) === 'none' ? 0 : monthlyFeeAmount(student, month);
  if (key === 'status') {
    const labels = { none: 'Aidat yok', late: 'Ödenmedi', paid: 'Ödendi', exempt: 'Muaf', unknown: 'Bilinmiyor' };
    return labels[monthlyFeeStatus(student, month)] || '';
  }
  return month;
}
function sortedMonthlyFeePeriods(student) {
  const direction = state.monthlyFeeSortDirection === 'desc' ? -1 : 1;
  const periods = state.monthlyFeeUnpaidOnly
    ? monthlyFeePeriods(student).filter(month => monthlyFeeStatus(student, month) === 'late')
    : monthlyFeePeriods(student);
  return [...periods].sort((left, right) => {
    const leftValue = monthlyFeeSortValue(student, left, state.monthlyFeeSortKey);
    const rightValue = monthlyFeeSortValue(student, right, state.monthlyFeeSortKey);
    return typeof leftValue === 'number' && typeof rightValue === 'number'
      ? (leftValue - rightValue) * direction
      : String(leftValue).localeCompare(String(rightValue), 'tr-TR', { numeric: true, sensitivity: 'base' }) * direction;
  });
}
function monthlyFeeRows(student) {
  const canEdit = state.role !== 'parent';
  const periods = sortedMonthlyFeePeriods(student);
  if (!periods.length) return `<tr><td colspan="${canEdit ? 5 : 4}"><div class="empty-state">${state.monthlyFeeUnpaidOnly ? 'Ödenmemiş aidat bulunmuyor.' : 'Aidat dönemi bulunmuyor.'}</div></td></tr>`;
  return periods.map(month => {
    const status = monthlyFeeStatus(student, month);
    const history = student.feeHistory?.[month];
    const amount = history?.amount !== null && history?.amount !== undefined ? formatCurrency(history.amount) : history?.note === 'Yıllık ödeme' ? 'Yıllık' : history || status === 'none' ? '—' : '₺1.500';
    const sourceNote = history?.note && !(status === 'none' && history.note === 'Aidat yok') ? `<small class="muted">${history.note}</small>` : '';
    const canSelectFeeStatus = canEdit && ['none', 'late'].includes(status);
    const statusMarkup = canSelectFeeStatus ? `${feeStatusControl(student, month, status)}${sourceNote}` : `${statusLabel(status)}${sourceNote}`;
    const paymentControl = status === 'none' ? statusLabel('none') : !['exempt', 'unknown'].includes(status) ? `<label class="fee-paid-control"><input type="checkbox" data-monthly-fee data-id="${student.id}" data-month="${month}" aria-label="${formatFeeMonth(month)} aidatını ödendi işaretle" ${status === 'paid' ? 'checked' : ''}><span>${status === 'paid' ? 'Ödendi' : 'Ödendi seç'}</span></label>` : '—';
    return `<tr><td><strong>${formatFeeMonth(month)}</strong></td><td>${amount}</td><td>${formatFeeDueDate(month)}</td><td>${statusMarkup}</td>${canEdit ? `<td>${paymentControl}</td>` : ''}</tr>`;
  }).join('');
}
function formatTrainingDate(value) { return value ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(`${value}T00:00:00`)) : 'Tarih belirtilmedi'; }
function formatTrainingDateLong(value) { return value ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date(`${value}T00:00:00`)) : 'Tarih belirtilmedi'; }
function sortedTrainings(list, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...list].sort((left, right) => `${left.date || ''}T${left.time || ''}`.localeCompare(`${right.date || ''}T${right.time || ''}`) * multiplier);
}
function formatAccountingDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T00:00:00`)) : value; }
function accountingDateInputValue(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const monthNumbers = { Oca: '01', Şub: '02', Mar: '03', Nis: '04', May: '05', Haz: '06', Tem: '07', Ağu: '08', Eyl: '09', Eki: '10', Kas: '11', Ara: '12' };
  const [day, month] = String(value).split(' ');
  return monthNumbers[month] ? `2026-${monthNumbers[month]}-${String(day).padStart(2, '0')}` : localDateValue();
}
function accountingPeriodLabel() { return ACCOUNTING_PERIODS.find(period => period.id === state.accountingPeriod)?.label || 'Son 1 ay'; }
function accountingPeriodEntries() {
  const period = ACCOUNTING_PERIODS.find(item => item.id === state.accountingPeriod) || ACCOUNTING_PERIODS[3];
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period.type === 'days') start.setDate(start.getDate() - (period.value - 1));
  else if (period.type === 'months') start.setMonth(start.getMonth() - period.value);
  else start.setFullYear(start.getFullYear() - period.value);
  return state.accountingEntries.filter(entry => {
    const [year, month, day] = accountingDateInputValue(entry.date).split('-').map(Number);
    const entryDate = new Date(year, month - 1, day);
    return entryDate >= start && entryDate <= end;
  }).sort((left, right) => {
    const dateOrder = accountingDateInputValue(right.date).localeCompare(accountingDateInputValue(left.date));
    return dateOrder || (Number(right.id) || 0) - (Number(left.id) || 0);
  });
}
function studentsForTraining(training) { return state.students.filter(student => student.group === training.group); }
function latestAttendanceForTraining(training) { return state.attendanceRecords.find(record => Number(record.trainingId) === Number(training.id)); }
function attendanceEntriesForStudent(student) {
  const seenTrainingIds = new Set();
  return state.attendanceRecords.map(record => {
    const training = state.trainings.find(item => Number(item.id) === Number(record.trainingId));
    const trainingId = Number(record.trainingId);
    if (!training || seenTrainingIds.has(trainingId)) return null;
    seenTrainingIds.add(trainingId);
    const present = Array.isArray(record.presentStudentIds) && record.presentStudentIds.some(studentId => Number(studentId) === Number(student.id));
    if (!present && training.group !== student.group) return null;
    return { record, training, present };
  }).filter(Boolean).sort((a, b) => `${a.training.date || ''}T${a.training.time || ''}`.localeCompare(`${b.training.date || ''}T${b.training.time || ''}`));
}
function studentAttendanceRate(student) {
  const entries = attendanceEntriesForStudent(student);
  if (!entries.length) return 0;
  const presentCount = entries.filter(entry => entry.present).length;
  return Math.round(presentCount / entries.length * 100);
}
function formatTimelineDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
    : value;
}
function studentTimelineEntries(student) {
  const attendanceEvents = attendanceEntriesForStudent(student).map(({ training, present }) => ({
    date: training.date,
    title: present ? 'Antrenmana katıldı' : 'Antrenmana katılmadı',
    detail: `${training.title} · ${training.group} · ${training.coach}`,
    tone: present ? 'positive' : 'negative'
  }));
  const feeEvents = isCoachRole() ? [] : monthlyFeePeriods(student).flatMap(month => {
    const status = monthlyFeeStatus(student, month);
    if (!['paid', 'late'].includes(status)) return [];
    const history = student.feeHistory?.[month];
    const amount = history?.amount !== null && history?.amount !== undefined ? formatCurrency(history.amount) : history?.note === 'Yıllık ödeme' ? 'Yıllık ödeme' : formatCurrency(1500);
    const definitionDate = /^\d{4}-\d{2}-\d{2}/.test(history?.createdAt || '') ? history.createdAt.slice(0, 10) : `${month}-01`;
    const events = [{
      date: definitionDate,
      title: 'Aidat tanımlandı',
      detail: `${formatFeeMonth(month)} · ${amount} · Son ödeme ${formatFeeDueDate(month)}`,
      tone: 'neutral'
    }];
    if (status === 'paid') {
      const paymentDate = /^\d{4}-\d{2}-\d{2}/.test(history?.paidAt || '') ? history.paidAt.slice(0, 10) : definitionDate;
      events.push({
        date: paymentDate,
        title: 'Aidat ödendi',
        detail: `${formatFeeMonth(month)} · ${amount}`,
        tone: 'positive'
      });
    }
    return events;
  });
  const enrollmentDate = /^\d{4}-\d{2}-\d{2}$/.test(student.enrollmentDate) ? student.enrollmentDate : '2026-07-22';
  const importedRecord = enrollmentDate === '2026-07-22';
  const enrollmentEvent = {
    date: enrollmentDate,
    title: importedRecord ? 'Öğrenci kaydı sisteme aktarıldı' : 'Futbol okuluna kaydoldu',
    detail: importedRecord ? `${student.group} grubu · Excel öğrenci listesi` : `${student.group} grubuna öğrenci kaydı oluşturuldu`,
    tone: 'neutral'
  };
  return [...attendanceEvents, ...feeEvents, enrollmentEvent].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function studentTimelineMarkup(student) {
  const entries = studentTimelineEntries(student);
  const expanded = Number(state.expandedTimelineStudentId) === Number(student.id);
  const visibleEntries = expanded ? entries : entries.slice(0, 4);
  const historyButton = entries.length > 4 ? `<div class="student-timeline-actions"><button class="secondary-button" type="button" data-action="toggle-student-timeline" data-id="${student.id}" aria-expanded="${expanded}">${expanded ? 'Daha az göster' : 'Geçmiş hareketler'}</button></div>` : '';
  return `<section class="panel student-timeline-card"><div class="panel-heading"><div><h3>Öğrenci zaman çizelgesi</h3><small class="muted">${isCoachRole() ? 'Kayıt ve yoklama hareketleri' : 'Kayıt, aidat ve yoklama hareketleri'}</small></div><span class="status blue">${entries.length} hareket</span></div><ol class="student-timeline">${visibleEntries.map(entry => `<li class="${entry.tone}"><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-content"><time datetime="${entry.date}">${formatTimelineDate(entry.date)}</time><strong>${entry.title}</strong><small>${entry.detail}</small></div></li>`).join('') || '<li class="timeline-empty">Henüz zaman çizelgesi hareketi bulunmuyor.</li>'}</ol>${historyButton}</section>`;
}
function trainingAttendanceLabel(training) {
  const trainingStudents = studentsForTraining(training);
  const latestAttendance = latestAttendanceForTraining(training);
  if (!latestAttendance) return `${trainingStudents.length} öğrenci`;
  const trainingStudentIds = new Set(trainingStudents.map(student => student.id));
  const presentCount = latestAttendance.presentStudentIds.filter(studentId => trainingStudentIds.has(Number(studentId))).length;
  return `${presentCount} / ${trainingStudents.length} öğrenci katıldı`;
}
function studentNameLink(student, inverse = false) { return `<button class="student-name-link${inverse ? ' inverse' : ''}" type="button" data-action="profile" data-id="${student.id}">${student.name}</button>`; }

function navMarkup(key, item) {
  return `<button class="nav-button ${state.page === key ? 'active' : ''}" type="button" data-page="${key}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`;
}

function renderNavigation() {
  const items = allowedItems();
  mainNav.innerHTML = items.map(([key, item]) => navMarkup(key, item)).join('');
  const mobileKeys = state.role === 'parent' ? ['dashboard', 'child', 'trainings', 'fees'] : ['dashboard', 'students', 'trainings', isAdminRole() ? 'accounting' : 'attendance'];
  bottomNav.innerHTML = mobileKeys.filter(key => navItems[key]?.roles.includes(state.role)).map(key => navMarkup(key, navItems[key])).join('');
}

function dashboardNotificationPromptMarkup() {
  if (runsInAndroidAppShell()) return '';
  const permission = currentPushPermission();
  const dismissed = window.localStorage.getItem(PUSH_PROMPT_DISMISS_STORAGE_KEY) === '1';
  const notificationsManuallyDisabled = window.localStorage.getItem(PUSH_PREFERENCE_STORAGE_KEY) === 'disabled';
  if (dismissed || notificationsManuallyDisabled || state.pushStatus !== 'disabled' || permission !== 'default') return '';
  return `<section class="panel dashboard-notification-prompt" aria-labelledby="dashboardNotificationPromptTitle">
    <span class="dashboard-notification-prompt-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path></svg></span>
    <div class="dashboard-notification-prompt-copy"><strong id="dashboardNotificationPromptTitle">Antrenman ve duyurulardan haberdar olun</strong><small>Yeni antrenmanları, iptalleri ve okul duyurularını telefonunuzdan takip edin. Android ilk etkinleştirmede web ve uygulama için iki onay gösterebilir.</small></div>
    <div class="dashboard-notification-prompt-actions"><button class="primary-button" type="button" data-action="enable-dashboard-notifications">Bildirimleri aç</button><button class="secondary-button" type="button" data-action="dismiss-dashboard-notifications">Şimdi değil</button></div>
  </section>`;
}

function schoolsView() {
  const activeSchools = state.schools.filter(school => school.active).length;
  const totalStudents = state.schools.reduce((total, school) => total + school.studentCount, 0);
  const totalDebt = state.schools.reduce((total, school) => total + school.unpaidTotal, 0);
  const schoolCards = state.schools.map(school => `
    <article class="panel school-management-card ${school.id === state.schoolId ? 'is-selected' : ''}">
      <div class="school-management-heading">
        <div><span class="eyebrow">${escapeHtml(school.slug)}</span><h3>${escapeHtml(school.name)}</h3></div>
        <span class="status ${school.active ? '' : 'warning'}">${school.active ? 'Aktif' : 'Pasif'}</span>
      </div>
      <div class="school-management-stats">
        <span><small>Öğrenci</small><strong>${school.studentCount}</strong></span>
        <span><small>Bu ay aktif</small><strong>${school.activeStudentCount}</strong></span>
        <span><small>Admin</small><strong>${school.adminCount}</strong></span>
        <span><small>Bekleyen aidat</small><strong>${formatCurrency(school.unpaidTotal)}</strong></span>
      </div>
      <div class="school-management-actions">
        <button class="primary-button" type="button" data-action="select-school" data-id="${school.id}" ${school.id === state.schoolId ? 'disabled' : ''}>${school.id === state.schoolId ? 'Açık okul' : 'Okulu aç'}</button>
        <button class="secondary-button" type="button" data-action="invite-school-admin" data-id="${school.id}" ${school.active ? '' : 'disabled'}>Kullanıcı davet et</button>
        <button class="secondary-button" type="button" data-action="rename-school" data-id="${school.id}">Adını düzenle</button>
        <button class="secondary-button" type="button" data-action="toggle-school-status" data-id="${school.id}">${school.active ? 'Pasife al' : 'Aktifleştir'}</button>
      </div>
    </article>`).join('');
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Futbol okulları</h2><p>Süper Admin yönetim merkezi</p></div></div>
    <section class="stats-grid school-platform-summary">
      <article class="stat-card"><span class="label">Toplam okul</span><strong>${state.schools.length}</strong><small>${activeSchools} aktif okul</small></article>
      <article class="stat-card"><span class="label">Toplam öğrenci</span><strong>${totalStudents}</strong><small>Tüm okullar</small></article>
      <article class="stat-card"><span class="label">Toplam bekleyen aidat</span><strong>${formatCurrency(totalDebt)}</strong><small>Tüm okullar</small></article>
    </section>
    <section class="panel school-create-panel">
      <div class="panel-heading"><div><h3>Yeni okul ekle</h3><small class="muted">Okul kendi öğrencileri, grupları, aidatları ve muhasebesiyle ayrı oluşturulur.</small></div></div>
      <form id="schoolCreateForm" class="school-create-form">
        <label>Okul adı<input name="schoolName" maxlength="120" placeholder="Örn. Çekmeköy Futbol Okulu" required></label>
        <label>Okul kodu<input name="schoolSlug" maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="cekmekoy-futbol" required><small>Küçük harf, rakam ve tire kullanın.</small></label>
        <label>Aylık aidat<input name="monthlyFeeAmount" type="number" min="1" step="1" value="${state.monthlyFeeAmount}" required></label>
        <button class="primary-button" type="submit">Okulu oluştur</button>
      </form>
    </section>
    <section class="school-management-grid">${schoolCards || '<div class="panel empty-state">Henüz okul bulunmuyor.</div>'}</section>
  </div>`;
}

function subscriptionDateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 'Belirlenmedi';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function subscriptionStatusMarkup(status) {
  const tone = status === 'active' ? '' : status === 'trial' ? 'blue' : status === 'past_due' ? 'danger' : 'warning';
  return `<span class="status ${tone}">${SUBSCRIPTION_STATUSES[status] || 'Belirlenmedi'}</span>`;
}

function subscriptionsView() {
  const schools = state.schools;
  const activeCount = schools.filter(school => school.subscriptionStatus === 'active').length;
  const trialCount = schools.filter(school => school.subscriptionStatus === 'trial').length;
  const waitingCount = schools.filter(school => school.subscriptionStatus === 'past_due').length;
  const recurringTotal = schools
    .filter(school => ['active', 'trial'].includes(school.subscriptionStatus))
    .reduce((total, school) => total + Number(school.subscriptionMonthlyPrice || 0), 0);
  const planCards = Object.entries(SUBSCRIPTION_PLANS).map(([code, plan]) => {
    const count = schools.filter(school => school.subscriptionPlan === code).length;
    const included = plan.features.map(feature => `<li class="included"><span aria-hidden="true">✓</span>${feature}</li>`).join('');
    const unavailable = plan.unavailable.map(feature => `<li class="unavailable"><span aria-hidden="true">×</span>${feature} yok</li>`).join('');
    return `<article class="panel subscription-plan-card"><span class="eyebrow">PAKET</span><div class="subscription-plan-heading"><h3>${plan.name}</h3><strong>${formatCurrency(plan.price)}<small>/ ay</small></strong></div><ul class="subscription-feature-list">${included}${unavailable}</ul><span class="subscription-school-count">${count} okul</span></article>`;
  }).join('');
  const rows = schools.map(school => `<div class="subscription-school-row">
    <div><strong>${escapeHtml(school.name)}</strong><small>${escapeHtml(school.slug)}</small></div>
    <span>${SUBSCRIPTION_PLANS[school.subscriptionPlan]?.name || 'Standart'}</span>
    ${subscriptionStatusMarkup(school.subscriptionStatus)}
    <span>${formatCurrency(school.subscriptionMonthlyPrice || 0)}<small>Aylık</small></span>
    <span>${subscriptionDateLabel(school.subscriptionEndsOn)}<small>Bitiş / yenileme</small></span>
    <button class="secondary-button" type="button" data-action="edit-subscription" data-id="${school.id}">Düzenle</button>
  </div>`).join('');
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Paketler ve abonelikler</h2><p>Okul bazında paket, ücret ve yenileme takibi</p></div></div>
    <section class="stats-grid subscription-summary-grid">
      <article class="stat-card"><span class="label">Aktif abonelik</span><strong>${activeCount}</strong><small>${trialCount} deneme hesabı</small></article>
      <article class="stat-card"><span class="label">Ödeme bekleyen</span><strong>${waitingCount}</strong><small>Takip edilmesi gereken okul</small></article>
      <article class="stat-card"><span class="label">Aylık abonelik toplamı</span><strong>${formatCurrency(recurringTotal)}</strong><small>Aktif ve deneme abonelikleri</small></article>
    </section>
    <section class="subscription-plan-grid">${planCards}</section>
    <section class="panel subscription-schools-panel"><div class="panel-heading"><div><h3>Okul abonelikleri</h3><small class="muted">Paket seçildiğinde aylık ücret otomatik uygulanır.</small></div><span class="status blue">${schools.length} okul</span></div>
      <div class="subscription-school-list">${rows || '<div class="empty-state">Henüz okul bulunmuyor.</div>'}</div>
    </section>
  </div>`;
}

function dashboardView() {
  if (state.role === 'parent') return parentDashboard();
  if (isCoachRole()) return coachDashboard();
  const activeStudents = state.students.filter(isActiveStudent);
  const pendingFeeStudents = state.students.filter(studentHasFeeDebt);
  const pendingFeeAmount = pendingFeeStudents.reduce((total, student) => total + unpaidFeePeriods(student).reduce((studentTotal, month) => studentTotal + monthlyFeeAmount(student, month), 0), 0);
  const currentMonth = feeMonthKey();
  const currentMonthEntries = state.accountingEntries.filter(entry => String(entry.date || '').startsWith(currentMonth));
  const currentMonthNet = currentMonthEntries.reduce((total, entry) => total + (entry.kind === 'expense' ? -entry.amount : entry.amount), 0);
  const plannedTrainings = sortedTrainings(
    state.trainings.filter(training => training.date >= localDateValue())
  );
  return `<div class="page-stack">
    ${dashboardNotificationPromptMarkup()}
    <div class="section-heading"><div><h2>Bugünün kulüp özeti</h2><p>${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())} · Son güncelleme şimdi</p></div></div>
    <section class="stats-grid club-summary-grid">
      <article class="stat-card"><span class="label">Aktif öğrenci</span><strong>${activeStudents.length} / ${state.students.length}</strong><button class="stat-link" type="button" data-page="students">${GROUPS.length} grup</button></article>
      <article class="stat-card"><span class="label">Planlanan antrenman</span><strong>${plannedTrainings.length}</strong><button class="stat-link" type="button" data-page="trainings">Takvime git</button></article>
      <article class="stat-card"><span class="label">Bekleyen aidat</span><strong>${formatCurrency(pendingFeeAmount)}</strong><button class="stat-link" type="button" data-action="pending-fees">${pendingFeeStudents.length} öğrenci</button></article>
      <article class="stat-card"><span class="label">Aylık net durum</span><strong>${formatCurrency(currentMonthNet)}</strong><small>${currentMonthEntries.length} muhasebe kaydı</small></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-heading"><h3>Planlanan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${plannedTrainings.slice(0, 4).map(t => `<div class="list-row training-summary-row"><span class="training-date-time"><small>${formatTrainingDate(t.date)}</small><b>${t.time}</b></span><div><strong>${t.group} · ${t.title}</strong><small>${t.coach} · ${t.field}</small></div><span class="status">${trainingAttendanceLabel(t)}</span></div>`).join('') || '<div class="empty-state">Planlanmış güncel antrenman bulunmuyor.</div>'}</article>
      <article class="panel"><div class="panel-heading"><h3>Kulüp performansı</h3><span class="status blue">Temmuz</span></div><div class="progress-group">
        ${progress('Aidat tahsilatı', 86)}${progress('Antrenman katılımı', 91)}${progress('Kontenjan kullanımı', 78)}
      </div></article>
    </section>
    <section class="panel"><div class="panel-heading"><h3>İşlem bekleyen aidatlar</h3><button class="text-button" data-page="fees">Tümünü gör</button></div>${pendingFeeStudents.slice(0, 4).map(s => `<div class="list-row"><span class="profile-avatar">${initials(s.name)}</span><div>${studentNameLink(s)}<span class="inline-separator" aria-hidden="true">•</span><small>Grup: ${s.group}${s.parent ? ` · Veli: ${s.parent}` : ''}</small></div><div class="fee-month-badges" aria-label="Ödenmemiş aylar">${unpaidFeePeriods(s).map(month => `<span class="status danger">${formatFeeMonth(month)}</span>`).join('')}</div></div>`).join('')}</section>
  </div>`;
}

function coachDashboard() {
  const plannedTrainings = sortedTrainings(state.trainings.filter(training => training.date >= localDateValue()));
  const recordedTrainings = state.attendanceRecords.length;
  const groupsWithStudents = new Set(state.students.map(student => student.group).filter(Boolean)).size;
  return `<div class="page-stack">
    ${dashboardNotificationPromptMarkup()}
    <div class="section-heading"><div><h2>Antrenör özeti</h2><p>${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())} · Son güncelleme şimdi</p></div></div>
    <section class="stats-grid club-summary-grid">
      <article class="stat-card"><span class="label">Öğrenci</span><strong>${state.students.length}</strong><button class="stat-link" type="button" data-page="students">${groupsWithStudents} grup</button></article>
      <article class="stat-card"><span class="label">Planlanan antrenman</span><strong>${plannedTrainings.length}</strong><button class="stat-link" type="button" data-page="trainings">Takvime git</button></article>
      <article class="stat-card"><span class="label">Kayıtlı yoklama</span><strong>${recordedTrainings}</strong><button class="stat-link" type="button" data-page="attendance">Yoklamaya git</button></article>
    </section>
    <section class="panel"><div class="panel-heading"><h3>Planlanan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${plannedTrainings.slice(0, 4).map(training => `<div class="list-row training-summary-row"><span class="training-date-time"><small>${formatTrainingDate(training.date)}</small><b>${training.time}</b></span><div><strong>${training.group} · ${training.title}</strong><small>${training.coach} · ${training.field}</small></div><span class="status">${trainingAttendanceLabel(training)}</span></div>`).join('') || '<div class="empty-state">Planlanmış güncel antrenman bulunmuyor.</div>'}</section>
  </div>`;
}

function progress(label, value) { return `<div><div class="progress-label"><span>${label}</span><strong>%${value}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${value}%"></div></div></div>`; }

function currentParentStudent() {
  return state.students.find(student => Number(student.id) === Number(state.selectedParentStudentId)) || state.students[0] || null;
}

function parentStudentSwitcherMarkup() {
  if (state.role !== 'parent' || isRolePreview() || state.students.length < 2) return '';
  const currentStudent = currentParentStudent();
  return `<label class="parent-student-switcher"><span>Öğrenci</span><select id="parentStudentSelect" aria-label="Görüntülenecek öğrenciyi seçin">${state.students.map(student => `<option value="${student.id}" ${Number(student.id) === Number(currentStudent?.id) ? 'selected' : ''}>${escapeHtml(student.name)}</option>`).join('')}</select></label>`;
}

function parentDashboard() {
  const student = currentParentStudent();
  if (!student) return '<div class="page-stack"><section class="panel empty-state">Bu veli hesabına bağlı öğrenci bulunmuyor.</section></div>';
  const unpaidMonths = unpaidFeePeriods(student);
  const feeDebtText = unpaidMonths.length === 0
    ? 'Aidat borcunuz yoktur.'
    : unpaidMonths.length === 1
      ? `${formatFeeMonth(unpaidMonths[0])} ayına ait aidat borcunuz mevcuttur.`
      : `${unpaidMonths.map(formatFeeMonth).join(', ')} aylarına ait aidat borcunuz mevcuttur.`;
  const now = new Date();
  const currentDateTime = `${localDateValue(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const studentTrainings = state.trainings.filter(training => training.group === student.group);
  const nextTraining = sortedTrainings(studentTrainings)
    .find(training => `${training.date || ''}T${training.time || ''}` >= currentDateTime);
  const nextTrainingCard = nextTraining
    ? `<article class="stat-card next-training-card"><span class="label">Sıradaki antrenman</span><strong>${formatTrainingDateLong(nextTraining.date)} · ${nextTraining.time}</strong><div class="next-training-details"><span><b>Tür:</b> ${nextTraining.title}</span><span><b>Süre:</b> ${nextTraining.duration || 90} dakika</span><span><b>Hoca:</b> ${nextTraining.coach}</span></div></article>`
    : '<article class="stat-card next-training-card"><span class="label">Sıradaki antrenman</span><strong>Planlanmış antrenman yok</strong><small>Öğrencinin grubu için yaklaşan kayıt bulunmuyor.</small></article>';
  const newsfeedItems = state.notifications.slice(0, 5).map(item => `<button class="newsfeed-item ${item.read ? '' : 'is-unread'}" type="button" data-page="notifications"><span class="newsfeed-marker" aria-hidden="true"></span><span class="newsfeed-content"><span class="newsfeed-meta"><span>${escapeHtml(item.date)} · ${escapeHtml(item.time)}</span>${item.read ? '' : '<span class="status warning">Yeni</span>'}</span><strong>${escapeHtml(item.title)}</strong>${item.body ? `<span class="newsfeed-message">${escapeHtml(item.body)}</span>` : ''}</span></button>`).join('');
  return `<div class="page-stack">
    ${dashboardNotificationPromptMarkup()}
    <section class="panel parent-hero"><span class="profile-avatar student-icon-avatar" aria-hidden="true">${MENU_ICONS.student}</span><div><h2>${student.name}</h2><p>${studentBirthYearLabel(student)} · ${student.group}${student.position ? ` · ${student.position}` : ''}</p></div><div class="parent-hero-actions">${parentStudentSwitcherMarkup()}<button class="secondary-button" data-action="profile" data-id="${student.id}">Profili görüntüle</button></div></section>
    <section class="stats-grid parent-dashboard-stats">
      ${nextTrainingCard}
      <article class="stat-card parent-fee-card"><span class="label">Aidat durumu</span><strong>${feeDebtText}</strong></article>
      <article class="stat-card"><span class="label">Katılım oranı</span><strong>%${studentAttendanceRate(student)}</strong><small>${attendanceEntriesForStudent(student).length} kayıtlı yoklama</small></article>
    </section>
    <section class="dashboard-grid"><article class="panel"><div class="panel-heading"><h3>Yaklaşan program</h3><button class="text-button" data-page="trainings">Takvim</button></div>${sortedTrainings(studentTrainings).slice(0,2).map(t => `<div class="list-row"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>${formatTrainingDate(t.date)} · ${t.field}</small></div><span class="status">Planlandı</span></div>`).join('') || '<div class="empty-state">Öğrencinin grubu için planlanmış antrenman bulunmuyor.</div>'}</article><article class="panel parent-newsfeed-panel"><div class="panel-heading"><h3>Duyurular</h3><button class="text-button" data-page="notifications">Tümünü gör</button></div><div class="parent-newsfeed">${newsfeedItems || '<div class="empty-state">Henüz yayınlanmış duyuru bulunmuyor.</div>'}</div></article></section>
  </div>`;
}

function studentsView() {
  const visibleStudents = filteredAndSortedStudents();
  const headingAction = isCoachRole() ? '' : `<button class="heading-icon-button" type="button" data-page="studentSettings" aria-label="Öğrenci ayarlarına git" title="Öğrenci ayarları">${MENU_ICONS.settings}</button>`;
  const addStudentButton = isCoachRole() ? '' : '<button class="primary-button" data-action="add-student">+ Yeni öğrenci</button>';
  const filters = isCoachRole() ? '' : `<div class="students-checkbox-filters"><label class="students-active-filter"><input id="activeStudentsOnlyFilter" type="checkbox" ${state.activeStudentsOnly ? 'checked' : ''}><span>Sadece aktif öğrenciler</span></label><label class="students-active-filter"><input id="debtStudentsOnlyFilter" type="checkbox" ${state.debtStudentsOnly ? 'checked' : ''}><span>Aidat borcu olanlar</span></label></div>`;
  const tableHeaders = isCoachRole()
    ? `${studentSortHeader('name', 'Öğrenci')}${studentSortHeader('birth', 'Doğum tarihi')}${studentSortHeader('enrollmentDate', 'Kayıt tarihi')}${studentSortHeader('group', 'Grup')}${studentSortHeader('position', 'Mevki')}${studentSortHeader('attendance', 'Devam')}<th></th>`
    : `${studentSortHeader('name', 'Öğrenci')}${studentSortHeader('birth', 'Doğum tarihi')}${studentSortHeader('enrollmentDate', 'Kayıt tarihi')}${studentSortHeader('group', 'Grup')}${studentSortHeader('position', 'Mevki')}${studentSortHeader('parent', 'Veli')}${studentSortHeader('fee', 'Aidat')}${studentSortHeader('attendance', 'Devam')}<th></th>`;
  return `<div class="page-stack"><div class="section-heading"><div><div class="section-title-with-action"><h2>Kayıtlı öğrenciler</h2>${headingAction}</div><p>Öğrenci kayıtları ve profilleri</p></div>${addStudentButton}</div>
    <div class="toolbar"><input class="search-input" id="studentSearch" type="search" placeholder="${isCoachRole() ? 'Öğrenci ara' : 'Öğrenci veya veli ara'}"><select id="groupFilter"><option value="">Tüm gruplar</option>${GROUPS.map(group => `<option>${escapeHtml(group)}</option>`).join('')}</select></div>
    ${filters}
    <div class="student-list-summary" aria-live="polite"><span>Listelenen öğrenci sayısı</span><strong><span id="studentsCountSummary">${visibleStudents.length}</span> / ${state.students.length}</strong></div>
    <section class="panel table-wrap"><table><thead><tr>${tableHeaders}</tr></thead><tbody id="studentsBody">${studentRows(visibleStudents)}</tbody></table></section></div>`;
}

function studentSettingsView() {
  const alphabeticGroups = [...GROUPS].sort((left, right) => left.localeCompare(right, 'tr-TR', { numeric: true, sensitivity: 'base' }));
  const displayedGroups = state.newestGroupPinned && state.newestGroupName && GROUPS.includes(state.newestGroupName)
    ? [state.newestGroupName, ...alphabeticGroups.filter(group => group !== state.newestGroupName)]
    : alphabeticGroups;
  const groupRows = displayedGroups.map(group => {
    const studentCount = state.students.filter(student => student.group === group).length;
    const trainingCount = state.trainings.filter(training => training.group === group).length;
    const inUse = studentCount > 0 || trainingCount > 0;
    if (state.editingGroupName === group) {
      return `<form class="group-settings-row group-rename-form" data-group="${escapeHtml(group)}" data-original-group="${escapeHtml(group)}"><div><label for="editGroupName">Grup adını düzenle</label><input id="editGroupName" name="groupName" maxlength="60" value="${escapeHtml(group)}" required><small>${studentCount} öğrenci · ${trainingCount} antrenman</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="cancel-edit-group">Vazgeç</button><button class="primary-button" type="submit">Kaydet</button></div></form>`;
    }
    return `<div class="group-settings-row" data-group="${escapeHtml(group)}"><div><strong>${escapeHtml(group)}</strong><small>${studentCount} öğrenci · ${trainingCount} antrenman</small></div><div class="group-settings-actions"><button class="secondary-button" type="button" data-action="edit-group" data-group="${escapeHtml(group)}">Düzenle</button><button class="danger-button" type="button" data-action="delete-group" data-group="${escapeHtml(group)}" ${inUse ? 'disabled' : ''} title="${inUse ? 'Önce bu gruptaki öğrenci ve antrenman kayıtlarını başka gruba taşıyın' : 'Grubu sil'}">Sil</button></div></div>`;
  }).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Öğrenci ayarları</h2><p>Öğrenci kayıtlarında kullanılacak gruplar</p></div></div><details class="panel group-settings-panel"${state.groupSettingsOpen ? ' open' : ''}><summary class="group-settings-summary"><div><h3>Gruplar</h3><small class="muted">${GROUPS.length} kayıtlı grup</small></div><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><div class="group-settings-content"><form id="groupSettingsForm" class="group-settings-form"><label for="newGroupName">Yeni grup adı</label><input id="newGroupName" name="groupName" maxlength="60" placeholder="Örn. U15 veya Saat 14:00" required><button class="primary-button" type="submit">Grup ekle</button></form><div class="group-settings-list">${groupRows || '<div class="empty-state">Henüz grup eklenmemiş.</div>'}</div><small class="form-hint group-settings-hint">Öğrenci veya antrenman kaydı bulunan gruplar silinemez. Önce ilgili kayıtları başka bir gruba taşıyın.</small></div></details></div>`;
}

function studentSortHeader(key, label) {
  const active = state.studentSortKey === key;
  const direction = active ? state.studentSortDirection : 'none';
  const indicator = active ? state.studentSortDirection === 'asc' ? '↑' : '↓' : '↕';
  return `<th aria-sort="${direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}"><button class="table-sort-button" type="button" data-action="student-sort" data-sort-key="${key}"><span>${label}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;
}
function studentSortValue(student, key) {
  if (key === 'fee') return studentHasFeeDebt(student) ? 'Borç var' : 'Borç yok';
  if (key === 'attendance') return studentAttendanceRate(student);
  return student[key] || '';
}
function sortStudentList(list) {
  if (!state.studentSortKey) return list;
  const direction = state.studentSortDirection === 'desc' ? -1 : 1;
  return [...list].sort((left, right) => {
    const leftValue = studentSortValue(left, state.studentSortKey);
    const rightValue = studentSortValue(right, state.studentSortKey);
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? (leftValue - rightValue) * direction
      : String(leftValue).localeCompare(String(rightValue), 'tr-TR', { numeric: true, sensitivity: 'base' }) * direction;
    if (comparison !== 0) return comparison;
    return state.studentSortKey === 'enrollmentDate' ? (Number(left.id) - Number(right.id)) * direction : 0;
  });
}
function filteredAndSortedStudents() {
  const query = (document.querySelector('#studentSearch')?.value || '').toLocaleLowerCase('tr');
  const group = document.querySelector('#groupFilter')?.value || '';
  const filtered = state.students.filter(student => {
    const searchText = isCoachRole() ? student.name : `${student.name} ${student.parent}`;
    const roleFiltersMatch = isCoachRole() || ((!state.activeStudentsOnly || isActiveStudent(student)) && (!state.debtStudentsOnly || studentHasFeeDebt(student)));
    return roleFiltersMatch && (!query || searchText.toLocaleLowerCase('tr').includes(query)) && (!group || student.group === group);
  });
  return sortStudentList(filtered);
}
function updateStudentsTable() {
  const filtered = filteredAndSortedStudents();
  const studentsBody = document.querySelector('#studentsBody');
  if (studentsBody) studentsBody.innerHTML = studentRows(filtered);
  const countSummary = document.querySelector('#studentsCountSummary');
  if (countSummary) countSummary.textContent = filtered.length;
}
function updateStudentSortHeaders() {
  document.querySelectorAll('[data-action="student-sort"]').forEach(button => {
    const active = button.dataset.sortKey === state.studentSortKey;
    button.querySelector('.sort-indicator').textContent = active ? state.studentSortDirection === 'asc' ? '↑' : '↓' : '↕';
    button.closest('th')?.setAttribute('aria-sort', active ? state.studentSortDirection === 'asc' ? 'ascending' : 'descending' : 'none');
  });
}
function studentHasFeeDebt(student) { return unpaidFeePeriods(student).length > 0; }
function studentListFeeLabel(student) { return studentHasFeeDebt(student) ? '<span class="status danger">Borç var</span>' : '<span class="status">Borç yok</span>'; }
function studentRows(list) {
  return list.map(student => {
    const commonStart = `<td><span class="profile-cell"><span class="profile-avatar">${initials(student.name)}</span>${studentNameLink(student)}</span></td><td>${student.birth}</td><td>${formatEnrollmentDate(student.enrollmentDate) || '—'}</td><td>${student.group || '—'}</td><td>${student.position || '—'}</td>`;
    const protectedColumns = isCoachRole() ? '' : `<td>${student.parent || '—'}<br><small class="muted">${student.phone}</small></td><td>${studentListFeeLabel(student)}</td>`;
    return `<tr>${commonStart}${protectedColumns}<td>%${studentAttendanceRate(student)}</td><td><button class="text-button" data-action="profile" data-id="${student.id}">Profili aç</button></td></tr>`;
  }).join('');
}

function childView() {
  const s = currentParentStudent();
  if (!s) return '<div class="page-stack"><section class="panel empty-state">Bu veli hesabına bağlı öğrenci bulunmuyor.</section></div>';
  const feeStatus = currentFeeStatus(s);
  const feeText = feeStatus === 'paid' ? 'Ödendi' : feeStatus === 'late' ? 'Ödenmedi' : feeStatus === 'none' ? 'Aidat yok' : 'Bekliyor';
  const attendanceCount = attendanceEntriesForStudent(s).length;
  return `<div class="page-stack"><section class="panel parent-hero"><span class="profile-avatar student-icon-avatar" aria-hidden="true">${MENU_ICONS.student}</span><div><h2>${studentNameLink(s, true)}</h2><p>${s.birth} · ${s.group}${s.position ? ` · ${s.position}` : ''}</p></div><button class="secondary-button" data-action="profile" data-id="${s.id}">Tam profili aç</button></section><section class="stats-grid"><article class="stat-card"><span class="label">Katılım</span><strong>%${studentAttendanceRate(s)}</strong><small>${attendanceCount ? `${attendanceCount} kayıtlı yoklama` : 'Henüz yoklama yok'}</small></article><article class="stat-card"><span class="label">Aidat</span><strong>${feeText}</strong><small>${formatFeeMonth(feeMonthKey())}</small></article><article class="stat-card"><span class="label">Antrenman grubu</span><strong>${s.group}</strong><small>Güncel grup</small></article><article class="stat-card"><span class="label">Mevki</span><strong>${s.position || 'Belirtilmedi'}</strong><small>Oyuncu profili</small></article></section><section class="panel"><div class="panel-heading"><h3>İletişim bilgileri</h3></div><div class="progress-group"><span><strong>Veli:</strong> ${s.parent || 'Bilgi girilmedi'}</span><span><strong>Telefon:</strong> ${s.phone}</span><span><strong>E-posta:</strong> ${s.email || 'Bilgi girilmedi'}</span></div></section></div>`;
}

function studentProfileView() {
  const allowedStudent = state.role === 'parent' ? currentParentStudent() : state.students.find(student => student.id === Number(state.selectedStudentId));
  const student = allowedStudent || state.students[0];
  if (!student) return `<div class="page-stack"><section class="panel empty-state"><h2>Öğrenci bulunamadı</h2><button class="secondary-button" data-page="${state.role === 'parent' ? 'dashboard' : 'students'}">Geri dön</button></section></div>`;
  const attendanceCount = attendanceEntriesForStudent(student).length;
  const activeStudent = isActiveStudent(student);
  const unpaidFees = unpaidFeePeriods(student);
  const feeDebtBalance = unpaidFees.reduce((total, month) => total + monthlyFeeAmount(student, month), 0);
  const feeSummaryCard = `<button class="stat-card profile-fee-summary-card" type="button" data-action="scroll-profile-fees" aria-label="Aylık aidat takibine git"><span class="label">Aidat durumu</span><strong>${formatCurrency(feeDebtBalance)}</strong><small class="${feeDebtBalance ? 'fee-debt-present' : 'fee-debt-clear'}">${feeDebtBalance ? 'Borç bakiye mevcut' : 'Borç bulunmuyor'}</small></button>`;
  const profileActions = state.role === 'parent'
    ? parentStudentSwitcherMarkup()
    : isCoachRole() ? '' : '<button class="secondary-button" data-action="edit-profile">Bilgileri düzenle</button>';
  const profileStats = isCoachRole()
    ? `<button class="stat-card profile-attendance-summary-card" type="button" data-page="studentAttendanceHistory" aria-label="Yoklama geçmişine git"><span class="label">Devam oranı</span><strong>%${studentAttendanceRate(student)}</strong><small>${attendanceCount} kayıtlı yoklama</small></button><article class="stat-card"><span class="label">Antrenman Grubu</span><strong>${student.group}</strong><small>Güncel antrenman grubu</small></article><article class="stat-card"><span class="label">Mevki</span><strong>${student.position || 'Belirtilmedi'}</strong><small>Oyuncu profili</small></article>`
    : `<button class="stat-card profile-attendance-summary-card" type="button" data-page="studentAttendanceHistory" aria-label="Yoklama geçmişine git"><span class="label">Devam oranı</span><strong>%${studentAttendanceRate(student)}</strong><small>${attendanceCount} kayıtlı yoklama</small></button>${feeSummaryCard}<article class="stat-card"><span class="label">Antrenman Grubu</span><strong>${student.group}</strong><small>Aktif antrenman grubu</small></article><article class="stat-card"><span class="label">Mevki</span><strong>${student.position || 'Belirtilmedi'}</strong><small>Oyuncu profili</small></article>`;
  const guardianDetails = isCoachRole() ? '' : `<article class="panel"><div class="panel-heading"><h3>Veli ve iletişim</h3></div><dl class="detail-list"><div><dt>Veli adı soyadı</dt><dd>${student.parent || 'Bilgi girilmedi'}</dd></div><div><dt>Telefon</dt><dd><a href="tel:${student.phone}">${student.phone}</a></dd></div><div><dt>E-posta</dt><dd>${student.email ? `<a href="mailto:${student.email}">${student.email}</a>` : 'Bilgi girilmedi'}</dd></div><div><dt>Kısa adres</dt><dd>${student.address || 'Adres bilgisi girilmemiş'}</dd></div></dl></article>`;
  const feeTrackingSection = isCoachRole() ? '' : `<section class="panel" id="monthlyFeeSection"><div class="panel-heading"><div><h3>Aylık aidat takibi</h3><small class="muted">Kayıt tarihinden itibaren tüm dönemler</small></div><span class="status blue">${monthlyFeePeriods(student).length} dönem</span></div><div class="students-checkbox-filters monthly-fee-filter"><label class="students-active-filter"><input id="monthlyFeeUnpaidOnlyFilter" type="checkbox" ${state.monthlyFeeUnpaidOnly ? 'checked' : ''}><span>Sadece ödenmemiş aidatları göster</span></label></div><div class="table-wrap"><table class="monthly-fee-table"><thead><tr>${monthlyFeeSortHeader('period', 'Dönem')}${monthlyFeeSortHeader('amount', 'Tutar')}${monthlyFeeSortHeader('due', 'Son ödeme')}${monthlyFeeSortHeader('status', 'Durum')}${state.role !== 'parent' ? '<th>Ödeme</th>' : ''}</tr></thead><tbody>${monthlyFeeRows(student)}</tbody></table></div></section>`;
  return `<div class="page-stack">
    <div class="section-heading"><div></div>${profileActions}</div>
    <section class="panel student-profile-hero"><span class="profile-avatar student-icon-avatar" aria-hidden="true">${MENU_ICONS.student}</span><div>${activeStudent && !isCoachRole() ? '<span class="eyebrow">AKTİF ÖĞRENCİ</span>' : ''}<h2>${student.name}</h2><p>${studentBirthYearLabel(student)} · Grup: ${student.group}${student.position ? ` · ${student.position}` : ''}</p></div></section>
    <section class="stats-grid profile-stats-grid">${profileStats}</section>
    <section class="profile-details-grid"><article class="panel"><div class="panel-heading"><h3>Öğrenci bilgileri</h3></div><dl class="detail-list"><div><dt>Adı soyadı</dt><dd>${student.name}</dd></div><div><dt>Doğum tarihi</dt><dd>${student.birth}</dd></div><div><dt>Kayıt tarihi</dt><dd>${formatEnrollmentDate(student.enrollmentDate)}</dd></div><div><dt>Antrenman Grubu</dt><dd>${student.group}</dd></div><div><dt>Oynadığı mevki</dt><dd>${student.position || 'Bilgi girilmedi'}</dd></div></dl></article>${guardianDetails}</section>
    ${feeTrackingSection}
    <section class="panel"><div class="panel-heading"><h3>Yaklaşan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${sortedTrainings(state.trainings.filter(training => training.group === student.group)).slice(0, 4).map(training => `<div class="list-row"><span class="time">${training.time}</span><div><strong>${training.title}</strong><small>${formatTrainingDate(training.date)} · ${training.coach} · ${training.field}</small></div><span class="status">${training.group}</span></div>`).join('') || '<div class="empty-state">Bu grup için planlanmış antrenman bulunmuyor.</div>'}</section>
    ${studentTimelineMarkup(student)}
  </div>`;
}

function studentAttendanceHistoryView() {
  const allowedStudent = state.role === 'parent' ? currentParentStudent() : state.students.find(student => student.id === Number(state.selectedStudentId));
  const student = allowedStudent || state.students[0];
  if (!student) return `<div class="page-stack"><section class="panel empty-state"><h2>Öğrenci bulunamadı</h2><button class="secondary-button" data-page="dashboard">Geri dön</button></section></div>`;
  const entries = attendanceEntriesForStudent(student);
  const presentCount = entries.filter(entry => entry.present).length;
  const absentCount = entries.length - presentCount;
  return `<div class="page-stack"><div class="section-heading"><div><h2>${student.name} · Yoklama geçmişi</h2><p>Kayıtlı antrenman katılım sonuçları</p></div></div><section class="stats-grid"><article class="stat-card"><span class="label">Toplam yoklama</span><strong>${entries.length}</strong><small>Kayıtlı antrenman</small></article><article class="stat-card"><span class="label">Geldi</span><strong>${presentCount}</strong><small>Katıldığı antrenman</small></article><article class="stat-card"><span class="label">Gelmedi</span><strong>${absentCount}</strong><small>Katılmadığı antrenman</small></article></section><section class="panel table-wrap"><table><thead><tr><th>Tarih / Saat</th><th>Antrenman</th><th>Antrenör / Saha</th><th>Durum</th></tr></thead><tbody>${entries.map(entry => `<tr><td><strong>${formatTrainingDate(entry.training.date)}</strong><br><small class="muted">${entry.training.time}</small></td><td>${entry.training.title}<br><small class="muted">${entry.training.group}</small></td><td>${entry.training.coach}<br><small class="muted">${entry.training.field}</small></td><td><span class="status ${entry.present ? '' : 'danger'}">${entry.present ? 'Geldi' : 'Gelmedi'}</span></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state">Bu öğrenci için henüz kayıtlı yoklama bulunmuyor.</div></td></tr>'}</tbody></table></section></div>`;
}

function trainingsView() {
  const parentStudent = state.role === 'parent' ? currentParentStudent() : null;
  const groupTrainings = parentStudent
    ? state.trainings.filter(training => training.group === parentStudent.group)
    : state.role === 'parent'
      ? []
      : state.trainings;
  const visibleTrainings = state.showPastTrainings
    ? groupTrainings
    : groupTrainings.filter(training => training.date >= localDateValue());
  const orderedTrainings = sortedTrainings(visibleTrainings, state.trainingSortDirection);
  const listDescription = parentStudent
    ? `${parentStudent.group} grubu · ${visibleTrainings.length} kayıt`
    : `Planlanan grup çalışmaları · ${visibleTrainings.length} kayıt`;
  const emptyMessage = parentStudent
    ? `${parentStudent.group} grubu için planlanmış antrenman bulunmuyor.`
    : 'Henüz planlanmış antrenman bulunmuyor.';
  const canCreateTraining = ['super_admin', 'admin'].includes(state.role);
  return `<div class="page-stack"><div class="section-heading"><div><h2>Antrenman takvimi</h2><p>${listDescription}</p></div>${canCreateTraining ? '<button class="primary-button" data-action="new-training">+ Antrenman ekle</button>' : ''}</div><div class="training-list-block"><div class="training-list-toolbar"><label class="students-active-filter"><input id="showPastTrainingsFilter" type="checkbox" ${state.showPastTrainings ? 'checked' : ''}><span>Tarihi geçenleri de göster</span></label><label class="training-sort-control"><span>Sırala</span><select id="trainingSortSelect" aria-label="Antrenmanları sırala"><option value="desc" ${state.trainingSortDirection === 'desc' ? 'selected' : ''}>Yeniden eskiye</option><option value="asc" ${state.trainingSortDirection === 'asc' ? 'selected' : ''}>Eskiden yeniye</option></select></label></div><section class="card-grid">${orderedTrainings.map(t => `<article class="panel training-card ${t.date < localDateValue() ? 'is-past' : ''}"><header><div><span class="eyebrow">${t.group}</span><h3>${t.title}</h3></div><span class="training-schedule">${formatTrainingDate(t.date)}${state.role === 'parent' ? '' : ` · ${t.time}`}</span></header><div class="training-duration"><span aria-hidden="true">⏱️</span><span>${t.duration || 90} dakika</span></div><div class="training-meta"><span>⚑ ${t.field}</span><span>● ${t.coach}</span>${latestAttendanceForTraining(t) ? `<span>◎ ${trainingAttendanceLabel(t)}</span>` : ''}</div>${state.role !== 'parent' ? `<div class="training-actions"><button class="primary-button" data-action="attendance" data-id="${t.id}">Yoklama al</button>${isAdminRole() ? `<button class="secondary-button" type="button" data-action="edit-training" data-id="${t.id}">Düzenle</button>` : ''}</div>` : ''}</article>`).join('') || `<div class="panel empty-state">${emptyMessage}</div>`}</section></div></div>`;
}

function attendanceView() {
  const visibleTrainings = state.showPastAttendance
    ? state.trainings
    : state.trainings.filter(training => training.date >= localDateValue());
  const orderedTrainings = sortedTrainings(visibleTrainings, state.attendanceSortDirection);
  return `<div class="page-stack"><div class="section-heading"><div><h2>Yoklama merkezi</h2><p>Antrenman bazında katılım kaydı</p></div></div><div class="training-list-block"><div class="training-list-toolbar"><label class="students-active-filter"><input id="showPastAttendanceFilter" type="checkbox" ${state.showPastAttendance ? 'checked' : ''}><span>Tarihi geçenleri de göster</span></label><label class="training-sort-control"><span>Sırala</span><select id="attendanceSortSelect" aria-label="Yoklama antrenmanlarını sırala"><option value="desc" ${state.attendanceSortDirection === 'desc' ? 'selected' : ''}>Yeniden eskiye</option><option value="asc" ${state.attendanceSortDirection === 'asc' ? 'selected' : ''}>Eskiden yeniye</option></select></label></div><section class="panel">${orderedTrainings.map(t => `<div class="list-row attendance-training-row ${t.date < localDateValue() ? 'is-past' : ''}"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>${formatTrainingDate(t.date)} · ${trainingAttendanceLabel(t)} · ${t.coach}</small></div><button class="primary-button" data-action="attendance" data-id="${t.id}">Yoklama al</button></div>`).join('') || '<div class="empty-state">Gösterilecek antrenman bulunmuyor.</div>'}</section></div></div>`;
}

function feesView() {
  const isParent = state.role === 'parent';
  const selectedParentStudent = isParent ? currentParentStudent() : null;
  const allStudents = isParent ? (selectedParentStudent ? [selectedParentStudent] : []) : state.students;
  const parentStudent = isParent ? allStudents[0] : null;
  const parentUnpaidMonths = parentStudent ? unpaidFeePeriods(parentStudent) : [];
  const parentDebtBalance = parentStudent
    ? parentUnpaidMonths.reduce((total, month) => total + monthlyFeeAmount(parentStudent, month), 0)
    : 0;
  const pendingStudents = allStudents.filter(student => currentFeeStatus(student) === 'late');
  const list = state.feeFilter === 'pending' ? pendingStudents : allStudents;
  const currentMonth = feeMonthKey();
  const currentMonthLabel = formatFeeMonth(currentMonth);
  const liableStudents = allStudents.filter(student => ['paid', 'late'].includes(currentFeeStatus(student)));
  const total = liableStudents.reduce((sum, student) => sum + monthlyFeeAmount(student, currentMonth), 0);
  const collected = allStudents.filter(student => currentFeeStatus(student) === 'paid').reduce((sum, student) => sum + monthlyFeeAmount(student, currentMonth), 0);
  const pending = pendingStudents.reduce((sum, student) => sum + monthlyFeeAmount(student, currentMonth), 0);
  const title = state.feeFilter === 'pending' && !isParent ? 'Ödemesi yapılmamış öğrenciler' : isParent ? 'Aidat bilgilerim' : 'Aidat takip listesi';
  const headerAction = state.feeFilter === 'pending' && !isParent ? '<button class="secondary-button" data-action="fee-filter" data-filter="all">Tüm aidatları göster</button>' : !isParent ? '<button class="primary-button" data-action="collect-fee">+ Aidat tanımla</button>' : '';
  const summaryMarkup = isParent
    ? `<section class="stats-grid"><article class="stat-card parent-fee-card"><span class="label">Aidat durumu</span><strong>${parentDebtBalance ? `${formatCurrency(parentDebtBalance)} borç bakiyesi` : 'Aidat borcunuz yoktur.'}</strong><small>${parentDebtBalance ? `${parentUnpaidMonths.length} ödenmemiş dönem` : 'Ödenmemiş aidat bulunmuyor'}</small></article></section>`
    : `<section class="stats-grid"><article class="stat-card"><span class="label">Aylık tahakkuk</span><strong>${formatCurrency(total)}</strong><small>${currentMonthLabel}</small></article><article class="stat-card"><span class="label">Tahsil edilen</span><strong>${formatCurrency(collected)}</strong><small>${total ? `%${Math.round(collected / total * 100)} tahsilat` : '%0 tahsilat'}</small></article><article class="stat-card"><span class="label">Bekleyen</span><strong>${formatCurrency(pending)}</strong><small>${pendingStudents.length} öğrenci</small></article></section>`;
  const feeRows = isParent
    ? parentUnpaidMonths.map(month => ({ student: parentStudent, month, status: 'late' }))
    : list.map(student => ({ student, month: currentMonth, status: currentFeeStatus(student) }));
  const sortedFeeRows = sortFeeListRows(feeRows);
  const tableRows = isParent
    ? sortedFeeRows.map(row => `<tr><td>${studentNameLink(row.student)}</td><td>${formatFeeMonth(row.month)}</td><td>${formatCurrency(monthlyFeeAmount(row.student, row.month))}</td><td>${formatFeeDueDate(row.month)}</td><td>${statusLabel(row.status)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">Aidat borcunuz bulunmuyor.</div></td></tr>'
    : sortedFeeRows.map(row => {
        const { student, month, status } = row;
        const paymentControl = status === 'none'
          ? statusLabel('none')
          : `<label class="fee-paid-control"><input type="checkbox" data-monthly-fee data-id="${student.id}" data-month="${month}" aria-label="${formatFeeMonth(month)} aidatını ödendi işaretle" ${status === 'paid' ? 'checked' : ''}><span>${status === 'paid' ? 'Ödendi' : 'Ödendi seç'}</span></label>`;
        return `<tr><td>${studentNameLink(student)}</td><td>${formatFeeMonth(month)}</td><td>${status === 'none' ? '—' : formatCurrency(monthlyFeeAmount(student, month))}</td><td>${formatFeeDueDate(month)}</td><td>${feeStatusControl(student, month, status)}</td><td>${paymentControl}</td></tr>`;
      }).join('');
  const subtitle = isParent ? `${parentUnpaidMonths.length} ödenmemiş dönem` : `${currentMonthLabel} ödeme dönemi · ${list.length} öğrenci`;
  return `<div class="page-stack"><div class="section-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${headerAction}</div>${summaryMarkup}<section class="panel table-wrap"><table><thead><tr>${feeListSortHeader('name', 'Öğrenci')}${feeListSortHeader('period', 'Dönem')}${feeListSortHeader('amount', 'Tutar')}${feeListSortHeader('due', 'Son ödeme')}${feeListSortHeader('status', 'Durum')}${!isParent ? '<th></th>' : ''}</tr></thead><tbody>${tableRows}</tbody></table></section></div>`;
}

function feeListSortHeader(key, label) {
  const active = state.feeListSortKey === key;
  const indicator = active ? state.feeListSortDirection === 'asc' ? '↑' : '↓' : '↕';
  return `<th aria-sort="${active ? state.feeListSortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}"><button class="table-sort-button" type="button" data-action="fee-list-sort" data-sort-key="${key}"><span>${label}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;
}

function feeListSortValue(row, key) {
  if (key === 'enrollmentDate') return row.student.enrollmentDate || '';
  if (key === 'name') return row.student.name || '';
  if (key === 'period' || key === 'due') return row.month || '';
  if (key === 'amount') return row.status === 'none' ? 0 : monthlyFeeAmount(row.student, row.month);
  if (key === 'status') return ({ none: 'Aidat yok', late: 'Ödenmedi', paid: 'Ödendi', exempt: 'Muaf', unknown: 'Kaynak notu' })[row.status] || 'Bekliyor';
  return '';
}

function sortFeeListRows(rows) {
  const direction = state.feeListSortDirection === 'desc' ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = feeListSortValue(left, state.feeListSortKey);
    const rightValue = feeListSortValue(right, state.feeListSortKey);
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? (leftValue - rightValue) * direction
      : String(leftValue).localeCompare(String(rightValue), 'tr-TR', { numeric: true, sensitivity: 'base' }) * direction;
    if (comparison !== 0) return comparison;
    if (state.feeListSortKey === 'enrollmentDate') {
      const studentOrder = (Number(left.student.id) - Number(right.student.id)) * direction;
      return studentOrder || String(right.month || '').localeCompare(String(left.month || ''));
    }
    return String(left.student.name || '').localeCompare(String(right.student.name || ''), 'tr-TR', { sensitivity: 'base' });
  });
}

function accountingPeriodFiltersMarkup() {
  return `<div class="accounting-periods" role="group" aria-label="Muhasebe dönemi">${ACCOUNTING_PERIODS.map(period => `<button class="${state.accountingPeriod === period.id ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-period" data-period="${period.id}" aria-pressed="${state.accountingPeriod === period.id}">${period.label}</button>`).join('')}</div>`;
}

function paymentMethodTotals(entries, kind) {
  return entries.filter(entry => entry.kind === kind).reduce((totals, entry) => {
    const method = PAYMENT_METHODS[entry.paymentMethod] ? entry.paymentMethod : 'cash';
    totals[method] += Number(entry.amount) || 0;
    return totals;
  }, { cash: 0, transfer: 0, card: 0 });
}
function paymentMethodSummary(totals) {
  return `<small class="payment-method-summary"><span class="payment-method-cash">Nakit ${formatCurrency(totals.cash)}</span><span class="payment-method-transfer">Havale ${formatCurrency(totals.transfer)}</span><span class="payment-method-card">Kredi kartı ${formatCurrency(totals.card)}</span></small>`;
}

function accountingView() {
  const periodEntries = accountingPeriodEntries();
  const income = periodEntries.filter(entry => entry.kind === 'income').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expense = periodEntries.filter(entry => entry.kind === 'expense').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const incomeCount = periodEntries.filter(entry => entry.kind === 'income').length;
  const expenseCount = periodEntries.filter(entry => entry.kind === 'expense').length;
  const incomeMethods = paymentMethodTotals(periodEntries, 'income');
  const expenseMethods = paymentMethodTotals(periodEntries, 'expense');
  const cashRegisterMethods = {
    cash: incomeMethods.cash - expenseMethods.cash,
    transfer: incomeMethods.transfer - expenseMethods.transfer,
    card: incomeMethods.card - expenseMethods.card
  };
  return `<div class="page-stack"><div class="section-heading"><div><div class="section-title-with-action"><h2>Muhasebe</h2><button class="heading-icon-button" type="button" data-page="accountingSettings" aria-label="Muhasebe ayarlarına git" title="Muhasebe ayarları">${MENU_ICONS.settings}</button></div><p>Gelir ve Gider kayıtları · ${accountingPeriodLabel()}</p></div><button class="primary-button" data-action="new-entry">+ Yeni işlem</button></div>${accountingPeriodFiltersMarkup()}<section class="stats-grid"><article class="stat-card"><span class="label">Toplam gelir</span><strong>${formatCurrency(income)}</strong><div class="stat-card-breakdown"><button class="stat-link accounting-record-count" type="button" data-action="accounting-entries" data-kind="income">${incomeCount} kayıt</button>${paymentMethodSummary(incomeMethods)}</div></article><article class="stat-card"><span class="label">Toplam gider</span><strong>${formatCurrency(expense)}</strong><div class="stat-card-breakdown"><button class="stat-link accounting-record-count" type="button" data-action="accounting-entries" data-kind="expense">${expenseCount} kayıt</button>${paymentMethodSummary(expenseMethods)}</div></article><article class="stat-card"><span class="label">Kasa</span><strong>${formatCurrency(income - expense)}</strong><div class="stat-card-breakdown"><button class="stat-link accounting-record-count" type="button" data-action="accounting-entries" data-kind="all">${periodEntries.length} kayıt</button>${paymentMethodSummary(cashRegisterMethods)}</div></article></section><section class="panel"><div class="panel-heading"><h3>Son işlemler</h3><button class="text-button" type="button" data-action="accounting-entries" data-kind="all">Tümünü gör</button></div>${accountingEntryRows(periodEntries.slice(0, 4))}</section></div>`;
}

function accountingSettingsView() {
  return `<div class="page-stack"><div class="section-heading"><div><h2>Muhasebe ayarları</h2><p>Yeni aidat dönemlerinde kullanılacak varsayılan tutar</p></div></div><section class="panel accounting-settings-panel"><form id="accountingSettingsForm" class="accounting-settings-form"><label for="monthlyFeeAmount">Aylık aidat tutarı</label><div class="settings-amount-control"><input id="monthlyFeeAmount" name="monthlyFeeAmount" type="number" min="1" step="1" inputmode="numeric" value="${state.monthlyFeeAmount}" required><span>₺</span></div><button class="primary-button" type="submit">Kaydet</button></form><small class="form-hint settings-form-hint">Yeni aylarda Aidat tanımla formu bu tutarla açılır; geçmiş aidatlar değişmez.</small></section></div>`;
}

function accountingEntryRows(entries) {
  return entries.map(entry => `<div class="ledger-entry" data-entry-id="${entry.id}"><div class="ledger-date"><strong>${formatAccountingDate(entry.date)}</strong><span class="entry-type ${entry.kind}">${entry.type}</span></div><div class="ledger-details"><strong>${entry.title}</strong></div><div class="ledger-amount"><span class="amount ${entry.kind}">${entry.kind === 'income' ? '+' : '-'}${formatCurrency(entry.amount)}</span><small class="muted payment-method-label">${PAYMENT_METHODS[entry.paymentMethod] || 'Nakit'}</small></div><button class="ledger-menu-button" type="button" data-action="toggle-entry-actions" aria-label="${entry.title} işlem menüsünü aç" aria-expanded="false">...</button><div class="ledger-actions"><button class="secondary-button" type="button" data-action="edit-entry" data-id="${entry.id}">Düzenle</button><button class="danger-button" type="button" data-action="delete-entry" data-id="${entry.id}">Sil</button></div></div>`).join('') || '<div class="empty-state">Henüz muhasebe işlemi bulunmuyor.</div>';
}

function accountingEntriesView() {
  const periodEntries = accountingPeriodEntries();
  const filteredEntries = state.accountingFilter === 'all' ? periodEntries : periodEntries.filter(entry => entry.kind === state.accountingFilter);
  const filterLabel = state.accountingFilter === 'income' ? 'Gelir işlemleri' : state.accountingFilter === 'expense' ? 'Gider işlemleri' : 'Tüm işlemler';
  return `<div class="page-stack"><div class="section-heading"><div><h2>${filterLabel}</h2><p>${filteredEntries.length} kayıt · ${accountingPeriodLabel()}</p></div><button class="primary-button" data-action="new-entry">+ Yeni işlem</button></div>${accountingPeriodFiltersMarkup()}<div class="toolbar accounting-filters"><button class="${state.accountingFilter === 'all' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="all">Tümü</button><button class="${state.accountingFilter === 'income' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="income">Gelir</button><button class="${state.accountingFilter === 'expense' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="expense">Gider</button></div><section class="panel">${accountingEntryRows(filteredEntries)}</section></div>`;
}

function notificationsView() {
  const canSend = ['super_admin', 'admin'].includes(state.role);
  const canDelete = isAdminRole();
  const pushEnabled = state.pushStatus === 'enabled';
  const pushUnsupported = state.pushStatus === 'unsupported';
  const pushDenied = state.pushStatus === 'denied';
  const pushChecking = state.pushStatus === 'checking';
  const pushStatusLabel = state.pushBusy
    ? 'İşleniyor…'
    : pushEnabled
      ? 'Açık'
      : pushDenied
        ? 'Engellendi'
        : pushUnsupported
          ? 'Desteklenmiyor'
          : pushChecking
            ? 'Kontrol ediliyor…'
            : 'Kapalı';
  const pushSwitchDisabled = state.pushBusy || pushUnsupported || pushDenied || pushChecking;
  const pushDescription = pushEnabled
    ? 'Bu cihaz sistem bildirimlerini alacak.'
    : pushDenied
      ? 'Android uygulama ayarlarından bildirim iznini açın.'
      : 'Yeni duyuruları telefonunuzun bildirim alanında görün.';
  const pushPermissionCard = `<section class="panel push-permission-card"><div class="push-permission-row"><div class="push-permission-copy"><strong>Telefon bildirimleri</strong><small>${pushDescription}</small></div><label class="push-switch-control"><span>${pushStatusLabel}</span><input type="checkbox" role="switch" data-action="toggle-phone-notifications" aria-label="Telefon bildirimlerini ${pushEnabled ? 'kapat' : 'aç'}" ${pushEnabled ? 'checked' : ''} ${pushSwitchDisabled ? 'disabled' : ''}><span class="push-switch-track" aria-hidden="true"><span class="push-switch-thumb"></span></span></label></div></section>`;
  const audienceOptions = ['Tüm kullanıcılar', 'Tüm veliler', 'Aidat borcu olanlar', 'Aidat borcu olmayanlar', ...GROUPS.map(group => `${group} velileri`)];
  const composePanel = canSend ? `<section class="panel"><details class="notification-compose-disclosure" ${state.notificationComposeOpen ? 'open' : ''}><summary><h3>Yeni bildirim oluştur</h3><span class="status blue">Telefon bildirimi</span><span class="disclosure-chevron" aria-hidden="true">⌄</span></summary><form class="notification-compose" id="notificationForm"><label>Alıcı grubu<select name="audience" required>${audienceOptions.map(audience => `<option ${state.notificationDraft.audience === audience ? 'selected' : ''}>${escapeHtml(audience)}</option>`).join('')}</select></label><label>Başlık<input name="title" required placeholder="Örn. Antrenman saati değişikliği" value="${escapeHtml(state.notificationDraft.title)}"></label><label>Mesaj<textarea name="message" rows="3" required placeholder="Bildirim metnini yazın">${escapeHtml(state.notificationDraft.body)}</textarea></label><div class="compose-actions"><button class="primary-button" type="submit">Bildirimi gönder</button></div></form></details></section>` : '';
  const notificationRows = state.notifications.map(item => {
    const sentByCurrentUser = item.sentBy === state.userId;
    const recipientStatus = item.read ? 'Okundu' : 'Okunmadı';
    const visibleStatus = sentByCurrentUser ? item.status : recipientStatus;
    const deleteButton = canDelete ? `<button class="notification-delete-button" type="button" data-action="delete-notification" data-id="${item.id}" aria-label="${escapeHtml(item.title)} bildirimini sil">Sil</button>` : '';
    const metricsAvailable = item.recipientCount !== null && item.deliveredCount !== null;
    const deliverySucceeded = Number(item.deliveredCount) > 0;
    const deliveryStatus = metricsAvailable
      ? `<span class="status ${deliverySucceeded ? 'notification-delivery-status' : 'danger'}">${deliverySucceeded ? 'Teslim edildi' : 'Teslim edilemedi'} ${item.deliveredCount}/${item.recipientCount}</span>`
      : `<span class="status">${escapeHtml(item.status)}</span>`;
    const readStatus = metricsAvailable
      ? `<span class="status blue notification-read-status">Okundu ${item.readCount || 0}/${item.deliveredCount}</span>`
      : '';
    const statusMarkup = canDelete
      ? `<div class="notification-metrics">${deliveryStatus}${readStatus}</div>`
      : `<span class="status ${!sentByCurrentUser && !item.read ? 'warning' : ''}">${escapeHtml(visibleStatus)}</span>`;
    return `<div class="list-row notification-list-row"><span class="time">${escapeHtml(item.date)}</span><div class="notification-list-content"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body || '')}</p><small>${escapeHtml(item.audience)} · ${escapeHtml(item.time)}</small></div>${deleteButton}${statusMarkup}</div>`;
  }).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Bildirim merkezi</h2><p>Telefon bildirimleri ve gönderilen duyurular</p></div></div>${pushPermissionCard}${composePanel}<section class="panel"><div class="panel-heading"><h3>Son bildirimler</h3><span class="status">${state.notifications.length} kayıt</span></div>${notificationRows}</section></div>`;
}

function userApprovalsView() {
  const pendingRequests = state.accessRequests.filter(request => request.status === 'pending');
  const approvedRequests = state.accessRequests.filter(request => request.status === 'approved');
  const pendingRows = pendingRequests.map(request => {
    const emailVerified = Boolean(request.emailVerifiedAt);
    return `
    <div class="approval-row">
      <div>
        <strong>${escapeHtml(request.fullName)}</strong>
        <small>${escapeHtml(request.email)} · ${roleNames[request.requestedRole]}</small>
        <span class="status ${emailVerified ? '' : 'warning'}">${emailVerified ? 'E-posta doğrulandı' : 'E-posta doğrulaması bekleniyor'}</span>
      </div>
      <select id="approval-role-${request.id}" aria-label="${escapeHtml(request.fullName)} için kullanıcı rolü" ${emailVerified ? '' : 'disabled'}>
        <option value="admin" ${request.requestedRole === 'admin' ? 'selected' : ''}>Admin</option>
        <option value="coach" ${request.requestedRole === 'coach' ? 'selected' : ''}>Antrenör</option>
        <option value="parent" ${request.requestedRole === 'parent' ? 'selected' : ''}>Veli</option>
      </select>
      <div class="approval-actions">
        <label class="approval-switch-control pending"><span>${emailVerified ? 'Onay bekliyor' : 'Doğrulama bekleniyor'}</span><input type="checkbox" role="switch" aria-label="${escapeHtml(request.fullName)} kullanıcısını onayla" data-action="approve-user" data-id="${request.id}" ${emailVerified ? '' : 'disabled'}><span class="approval-switch-track" aria-hidden="true"><span class="approval-switch-thumb"></span></span></label>
      </div>
    </div>`;
  }).join('');
  const resolvedRows = approvedRequests.slice(0, 10).map(request => `
    <div class="list-row">
      <span class="status">Onaylandı</span>
      <div><strong>${escapeHtml(request.fullName)}</strong><small>${escapeHtml(request.email)} · ${roleNames[request.requestedRole]}</small></div>
      <label class="approval-switch-control"><span>Onaylı</span><input type="checkbox" role="switch" checked aria-label="${escapeHtml(request.fullName)} kullanıcısının onayını kaldır" data-action="revoke-user-approval" data-id="${request.id}"><span class="approval-switch-track" aria-hidden="true"><span class="approval-switch-thumb"></span></span></label>
    </div>`).join('');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Kullanıcı onayları</h2><p>${pendingRequests.length} bekleyen erişim talebi</p></div></div><section class="panel"><div class="panel-heading"><h3>Onay bekleyenler</h3><span class="status warning">${pendingRequests.length} talep</span></div>${pendingRows || '<div class="empty-state">Onay bekleyen kullanıcı bulunmuyor.</div>'}</section>${resolvedRows ? `<section class="panel"><div class="panel-heading"><h3>Onaylanmış kullanıcılar</h3></div>${resolvedRows}</section>` : ''}</div>`;
}

const views = { dashboard: dashboardView, schools: schoolsView, subscriptions: subscriptionsView, students: studentsView, studentSettings: studentSettingsView, studentProfile: studentProfileView, studentAttendanceHistory: studentAttendanceHistoryView, child: studentProfileView, trainings: trainingsView, attendance: attendanceView, fees: feesView, accounting: accountingView, accountingSettings: accountingSettingsView, accountingEntries: accountingEntriesView, userApprovals: userApprovalsView, notifications: notificationsView };

function render() {
  if (!navItems[state.page]?.roles.includes(state.role)) state.page = 'dashboard';
  persistNavigationState();
  renderNavigation();
  const [title, subtitle] = pageMeta[state.page];
  document.querySelector('#pageTitle').textContent = title;
  document.querySelector('#pageSubtitle').textContent = state.schoolName ? `${subtitle} · ${state.schoolName}` : subtitle;
  document.querySelector('#sidebarRole').textContent = roleNames[state.role];
  document.querySelector('#sidebarUser').textContent = state.userFullName || state.userEmail || 'SASA-F Kullanıcısı';
  const bannerSubtitle = state.role === 'super_admin'
    ? 'Futbol Okulu Yönetim Sistemi'
    : state.schoolName || 'Futbol Okulu';
  document.querySelector('#appBannerSubtitle').textContent = bannerSubtitle;
  document.querySelector('#sidebarBannerSubtitle').textContent = bannerSubtitle;
  const topbarSessionRole = document.querySelector('#topbarSessionRole');
  topbarSessionRole.textContent = roleNames[state.role];
  topbarSessionRole.classList.toggle('is-hidden', isActualSuperAdmin() || state.role === 'parent');
  const rolePreviewSelect = document.querySelector('#rolePreviewSelect');
  rolePreviewSelect.classList.toggle('is-hidden', !isActualSuperAdmin());
  rolePreviewSelect.value = state.role;
  const schoolSwitcher = document.querySelector('#schoolSwitcher');
  const schoolSelect = document.querySelector('#schoolSelect');
  schoolSwitcher.classList.toggle('is-hidden', !isActualSuperAdmin());
  if (isActualSuperAdmin()) {
    schoolSelect.innerHTML = state.schools.map(school => `<option value="${school.id}" ${school.id === state.schoolId ? 'selected' : ''}>${escapeHtml(school.name)}${school.active ? '' : ' (Pasif)'}</option>`).join('');
    schoolSelect.disabled = state.schools.length < 2;
  }
  updateNotificationUnreadBadge();
  globalBackButton.classList.toggle('is-hidden', state.page === 'dashboard');
  globalBackButton.disabled = state.page === 'dashboard';
  document.querySelector('.user-avatar').textContent = initials(state.userFullName || state.userEmail || 'SF');
  appContent.innerHTML = views[state.page]();
  appContent.focus({ preventScroll: true });
}

function updateNotificationUnreadBadge() {
  const unreadCount = state.notifications.filter(notification => !notification.read).length;
  const badge = document.querySelector('#notificationUnreadBadge');
  const button = badge?.closest('.topbar-notification-button');
  if (!badge || !button) return;
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  badge.classList.toggle('is-hidden', unreadCount === 0);
  button.setAttribute('aria-label', unreadCount
    ? `Bildirimleri aç, ${unreadCount} okunmamış bildirim`
    : 'Bildirimleri aç');
}

async function markAllNotificationsRead() {
  const unreadNotifications = state.notifications.filter(notification =>
    !notification.read
    && notification.id
    && !notificationReadIdsInFlight.has(Number(notification.id))
  );
  if (!unreadNotifications.length || !remoteDataStore) return;
  const notificationIds = unreadNotifications.map(notification => Number(notification.id));
  notificationIds.forEach(notificationId => notificationReadIdsInFlight.add(notificationId));
  unreadNotifications.forEach(notification => { notification.read = true; });
  if (state.page === 'notifications') render();
  else updateNotificationUnreadBadge();
  try {
    const updatedCounts = await remoteDataStore.markNotificationsRead(notificationIds);
    const readCountsById = new Map(updatedCounts.map(item => [Number(item.notificationId), Number(item.readCount)]));
    unreadNotifications.forEach(notification => {
      if (readCountsById.has(Number(notification.id))) {
        notification.readCount = readCountsById.get(Number(notification.id));
      }
    });
    if (state.page === 'notifications') render();
  } catch (error) {
    unreadNotifications.forEach(notification => { notification.read = false; });
    if (state.page === 'notifications') render();
    else updateNotificationUnreadBadge();
    showToast(`Bildirimler okundu olarak işaretlenemedi: ${error.message || 'Bağlantı hatası'}`);
  } finally {
    notificationIds.forEach(notificationId => notificationReadIdsInFlight.delete(notificationId));
  }
}

function showAuthMessage(message = '', isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle('is-hidden', !message);
  authMessage.classList.toggle('error', Boolean(message) && isError);
}

function setAuthPending(pending) {
  authRequestPending = pending;
  loginSubmitButton.disabled = pending;
  loginSubmitButton.textContent = pending ? 'Lütfen bekleyin…' : authMode === 'set-password' ? 'Şifremi kaydet' : authMode === 'signup' ? 'Kayıt ol' : authMode === 'reset-password' ? 'Bağlantı gönder' : 'Giriş yap';
}

function configureAuthForm(mode = 'login') {
  authMode = mode;
  const settingPassword = mode === 'set-password';
  const signingUp = mode === 'signup';
  const resettingPassword = mode === 'reset-password';
  document.querySelector('#authEyebrow').textContent = settingPassword ? 'HESABINIZI ETKİNLEŞTİRİN' : signingUp ? 'YENİ KULLANICI' : resettingPassword ? 'ŞİFRE YENİLEME' : 'HOŞ GELDİNİZ';
  document.querySelector('#authTitle').textContent = settingPassword ? 'Şifrenizi belirleyin' : signingUp ? 'Hesap oluşturun' : resettingPassword ? 'E-posta adresinizi yazın' : 'Kulübünüz tek ekranda';
  document.querySelector('#authDescription').textContent = settingPassword
    ? 'SASA-F hesabınız için en az 8 karakterli yeni bir şifre oluşturun.'
    : signingUp
      ? 'E-posta adresiniz öğrenci kayıtlarındaki irtibat adresiyle eşleşmelidir. Talebiniz Süper Admin onayına gönderilir.'
      : resettingPassword
        ? 'Şifre yenileme bağlantısını gönderebilmemiz için kayıtlı e-posta adresinizi girin.'
        : 'Öğrenci, antrenman, aidat ve kulüp yönetimine güvenli erişim.';
  document.querySelector('#authFullNameField').classList.toggle('is-hidden', !signingUp);
  document.querySelector('#authEmailField').classList.toggle('is-hidden', settingPassword);
  document.querySelector('#authPasswordField').classList.toggle('is-hidden', resettingPassword);
  document.querySelector('#authPasswordConfirmField').classList.toggle('is-hidden', !settingPassword && !signingUp);
  document.querySelector('#authSecondaryActions').classList.toggle('is-hidden', settingPassword || signingUp || resettingPassword);
  document.querySelector('#backToLoginButton').classList.toggle('is-hidden', !settingPassword && !signingUp && !resettingPassword);
  loginEmail.required = !settingPassword;
  loginPassword.required = !resettingPassword;
  signupFullName.required = signingUp;
  loginPasswordConfirm.required = settingPassword || signingUp;
  loginPassword.autocomplete = settingPassword || signingUp ? 'new-password' : 'current-password';
  signupFullName.value = '';
  loginPassword.value = '';
  loginPasswordConfirm.value = '';
  showAuthMessage();
  setAuthPending(false);
}

function showLoginScreen(message = '', isError = false) {
  appShell.classList.add('is-hidden');
  authScreen.classList.remove('is-hidden');
  configureAuthForm('login');
  showAuthMessage(message, isError);
  window.setTimeout(() => loginEmail.focus(), 0);
}

function showPasswordSetupScreen() {
  appShell.classList.add('is-hidden');
  authScreen.classList.remove('is-hidden');
  configureAuthForm('set-password');
  window.setTimeout(() => loginPassword.focus(), 0);
}

function applyRemoteData(remoteData) {
  state.schoolId = remoteData.schoolId;
  state.schoolName = remoteData.schoolName || state.schools.find(school => school.id === remoteData.schoolId)?.name || '';
  state.schoolSubscriptionPlan = remoteData.subscriptionPlan || state.schools.find(school => school.id === remoteData.schoolId)?.subscriptionPlan || 'standard';
  state.students = remoteData.students;
  state.trainings = remoteData.trainings;
  state.accountingEntries = remoteData.accountingEntries;
  state.notifications = remoteData.notifications;
  state.attendanceRecords = remoteData.attendanceRecords;
  state.accessRequests = remoteData.accessRequests || [];
  state.monthlyFeeAmount = Number(remoteData.monthlyFeeAmount) > 0 ? Number(remoteData.monthlyFeeAmount) : 1500;
  if (state.role === 'parent' && !state.students.some(student => Number(student.id) === Number(state.selectedParentStudentId))) {
    state.selectedParentStudentId = state.students[0]?.id || null;
  }
  const remoteGroups = [...new Set(remoteData.groups.map(group => group.name))];
  GROUPS = state.newestGroupPinned && state.newestGroupName && remoteGroups.includes(state.newestGroupName)
    ? [state.newestGroupName, ...remoteGroups.filter(group => group !== state.newestGroupName)]
    : remoteGroups;
  syncGroupOptions();
  persistLocalData();
}

async function refreshSchools() {
  if (!remoteDataStore) return [];
  state.schools = await remoteDataStore.listSchools();
  return state.schools;
}

async function switchSchool(schoolId, { navigate = true } = {}) {
  if (!isActualSuperAdmin() || !state.schools.some(school => school.id === schoolId)) return false;
  const selectedSchool = state.schools.find(school => school.id === schoolId);
  if (!selectedSchool?.active && !window.confirm('Bu okul pasif durumda. Yine de okulu açmak istiyor musunuz?')) return false;
  try {
    const remoteData = await remoteDataStore.load({ school_id: schoolId, user_id: state.userId, role: state.actualRole });
    state.selectedStudentId = null;
    state.selectedParentStudentId = null;
    state.notificationComposeOpen = false;
    applyRemoteData(remoteData);
    window.localStorage.setItem(SELECTED_SCHOOL_STORAGE_KEY, schoolId);
    if (navigate) {
      state.page = 'dashboard';
      state.pageHistory = [];
      initializeBrowserNavigation();
    }
    startRealtimeSync();
    render();
    return true;
  } catch (error) {
    showToast(`Okul verileri yüklenemedi: ${error.message || 'Bağlantı hatası'}`);
    return false;
  }
}

const REALTIME_TABLES = [
  'profiles',
  'schools',
  'training_groups',
  'students',
  'fee_periods',
  'trainings',
  'accounting_entries',
  'notifications',
  'notification_reads',
  'attendance_sessions',
  'attendance_records',
  'access_requests'
];
let realtimeChannel = null;
let realtimeRefreshTimer = null;
let realtimeRefreshInFlight = false;
let realtimeRefreshQueued = false;

function stopRealtimeSync() {
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = null;
  realtimeRefreshQueued = false;
  if (realtimeChannel && supabaseClient) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = null;
}

async function refreshRemoteDataFromRealtime() {
  if (!remoteDataStore || !state.schoolId || !state.userId) return;
  if (realtimeRefreshInFlight) {
    realtimeRefreshQueued = true;
    return;
  }
  realtimeRefreshInFlight = true;
  try {
    const remoteData = await remoteDataStore.load({ school_id: state.schoolId, user_id: state.userId, role: state.actualRole });
    applyRemoteData(remoteData);
    render();
    if (state.page === 'notifications') markAllNotificationsRead();
  } catch (error) {
    console.error('Realtime veri yenileme hatası:', error);
  } finally {
    realtimeRefreshInFlight = false;
    if (realtimeRefreshQueued) {
      realtimeRefreshQueued = false;
      scheduleRealtimeRefresh();
    }
  }
}

function scheduleRealtimeRefresh(payload = null) {
  if (payload?.table === 'profiles' && payload.eventType === 'DELETE' && payload.old?.id === state.userId) {
    signedOutMessage = 'Uygulama erişiminiz Süper Admin tarafından kaldırıldı.';
    stopRealtimeSync();
    supabaseClient.auth.signOut();
    return;
  }
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(refreshRemoteDataFromRealtime, 300);
}

function startRealtimeSync() {
  stopRealtimeSync();
  if (!supabaseClient || !state.schoolId || !state.userId) return;
  const channel = supabaseClient.channel(`sasa-school-${state.schoolId}-${state.userId}`);
  REALTIME_TABLES.forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRealtimeRefresh);
  });
  realtimeChannel = channel;
  channel.subscribe();
}

let activeProfileLoad = null;
async function showAuthenticatedApp(user) {
  if (activeProfileLoad?.userId === user.id) return activeProfileLoad.promise;
  const loadPromise = (async () => {
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('full_name, role, school_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!error && !profile) {
    const { data: request } = await supabaseClient
      .from('access_requests')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    await supabaseClient.auth.signOut();
    const requestMessage = request?.status === 'pending'
      ? 'E-posta adresiniz doğrulandı. Uygulama erişiminiz Süper Admin onayı bekliyor.'
      : request?.status === 'rejected'
        ? 'Kullanıcı erişim talebiniz admin tarafından reddedildi.'
        : 'Bu hesap için yetkili bir SASA-F profili bulunamadı.';
    showLoginScreen(requestMessage, request?.status !== 'pending');
    return;
  }

  if (error || !roleNames[profile.role]) {
    await supabaseClient.auth.signOut();
    showLoginScreen('Kullanıcı yetkisi kontrol edilemedi. Lütfen tekrar deneyin.', true);
    return;
  }

  if (!remoteDataStore) {
    showLoginScreen('Supabase veri bağlantısı yüklenemedi. Sayfayı yenileyip tekrar deneyin.', true);
    return;
  }

  authScreen.classList.remove('is-hidden');
  appShell.classList.add('is-hidden');
  configureAuthForm('login');
  document.querySelector('#authEyebrow').textContent = 'SASA-F.COM';
  document.querySelector('#authTitle').textContent = 'Kulüp verileri yükleniyor..';
  document.querySelector('#authDescription').textContent = 'Öğrenci, aidat, antrenman ve muhasebe kayıtları yükleniyor.';
  document.querySelector('#authEmailField').classList.add('is-hidden');
  document.querySelector('#authPasswordField').classList.add('is-hidden');
  document.querySelector('#authSecondaryActions').classList.add('is-hidden');
  loginSubmitButton.classList.add('is-hidden');

  let remoteData;
  try {
    state.schools = profile.role === 'super_admin' ? await remoteDataStore.listSchools() : [];
    const savedSchoolId = window.localStorage.getItem(SELECTED_SCHOOL_STORAGE_KEY);
    const initialSchoolId = profile.role === 'super_admin'
      ? (state.schools.find(school => school.id === savedSchoolId)?.id || state.schools.find(school => school.active)?.id || state.schools[0]?.id)
      : profile.school_id;
    if (!initialSchoolId) throw new Error('Yönetilecek aktif bir okul bulunamadı.');
    remoteData = await remoteDataStore.load({ school_id: initialSchoolId, user_id: user.id, role: profile.role });
  } catch (loadError) {
    configureAuthForm('login');
    showLoginScreen(`Kulüp verileri yüklenemedi: ${loadError.message || 'Bağlantı hatası'}`, true);
    return;
  }

  state.actualRole = profile.role;
  state.role = profile.role;
  state.userId = user.id;
  state.userFullName = profile.full_name || user.user_metadata?.full_name || '';
  state.userEmail = user.email || '';
  state.page = 'dashboard';
  state.pageHistory = [];
  state.notificationComposeOpen = false;
  state.notificationDraft = { audience: 'Tüm kullanıcılar', title: '', body: '' };
  applyRemoteData(remoteData);
  if (openDashboardAfterPasswordLogin) {
    window.sessionStorage.removeItem(NAVIGATION_STORAGE_KEY);
    openDashboardAfterPasswordLogin = false;
  } else {
    restoreNavigationState(user.id);
  }
  const requestedPage = new URLSearchParams(window.location.search).get('open');
  if (requestedPage === 'notifications' && navItems.notifications.roles.includes(state.role)) {
    state.page = 'notifications';
    state.pageHistory = [];
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  }
  initializeBrowserNavigation();
  document.querySelector('#authPasswordField').classList.remove('is-hidden');
  loginSubmitButton.classList.remove('is-hidden');
  authScreen.classList.add('is-hidden');
  appShell.classList.remove('is-hidden');
  setAuthPending(false);
  render();
  startRealtimeSync();
  refreshPushStatus(state.page === 'notifications' || state.page === 'dashboard');
  if (state.page === 'notifications') markAllNotificationsRead();
  })();
  activeProfileLoad = { userId: user.id, promise: loadPromise };
  try {
    await loadPromise;
  } finally {
    if (activeProfileLoad?.promise === loadPromise) activeProfileLoad = null;
  }
}

async function logout() {
  if (!supabaseClient) return;
  persistNavigationState();
  signedOutMessage = 'Oturumunuz güvenli biçimde kapatıldı.';
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    signedOutMessage = '';
    showToast('Oturum kapatılamadı. Lütfen tekrar deneyin.');
    return;
  }
  state.userFullName = '';
  state.userEmail = '';
  state.userId = null;
  state.actualRole = 'admin';
  state.role = 'admin';
  stopRealtimeSync();
}

function friendlyAuthError(error) {
  const rawMessage = error?.message || error?.error_description || error?.msg || '';
  const message = typeof rawMessage === 'string' && rawMessage !== '{}' ? rawMessage : '';
  if (/invalid login credentials/i.test(message)) return 'E-posta adresi veya şifre hatalı.';
  if (/email not confirmed/i.test(message)) return 'E-posta adresiniz henüz doğrulanmamış.';
  if (/password should be at least/i.test(message)) return 'Şifreniz en az 8 karakter olmalıdır.';
  if (/already registered|already been registered/i.test(message)) return 'Bu e-posta adresiyle daha önce kullanıcı kaydı oluşturulmuş.';
  if (/database error saving new user|kayıtlı veli e-posta adresi/i.test(message)) return 'Bu e-posta adresi öğrenci kayıtlarındaki irtibat adresleriyle eşleşmiyor.';
  if (/confirmation email|sending.*email|smtp|email.*authorized/i.test(message)) return 'Kullanıcı kaydı tamamlanamadı. Supabase e-posta doğrulama ayarı kapatılmalıdır.';
  if (/rate limit/i.test(message)) return 'Çok fazla deneme yapıldı. Lütfen kısa bir süre sonra tekrar deneyin.';
  return message || 'Kullanıcı kaydı tamamlanamadı. Lütfen tekrar deneyin.';
}

function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600); }

function pushSupported() {
  return window.isSecureContext
    && 'serviceWorker' in navigator;
}

function currentPushPermission() {
  if ('Notification' in window) return Notification.permission;
  return runsInAndroidAppShell() ? 'granted' : 'unsupported';
}

function clearNativeBridgeFragment() {
  if (!NATIVE_FCM_TOKEN && !NATIVE_NOTIFICATION_PERMISSION) return;
  const remainingFragment = new URLSearchParams(window.location.hash.slice(1));
  remainingFragment.delete('nativeFcmToken');
  remainingFragment.delete('nativeNotificationPermission');
  const fragment = remainingFragment.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}${fragment ? `#${fragment}` : ''}`
  );
}

async function registerNativeFcmToken() {
  if (!state.userId || !state.nativeFcmToken) return false;
  const { error } = await supabaseClient.rpc('register_fcm_token', {
    fcm_registration_token: state.nativeFcmToken,
    fcm_device_name: navigator.userAgent
  });
  if (error) throw error;
  clearNativeBridgeFragment();
  return true;
}

async function unregisterNativeFcmToken() {
  if (!state.userId || !state.nativeFcmToken) return;
  const { error } = await supabaseClient
    .from('fcm_tokens')
    .delete()
    .eq('token', state.nativeFcmToken);
  if (error) throw error;
}

async function getPushRegistration() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.register('./service-worker.js?v=2026.08.09.248', { scope: './', updateViaCache: 'none' });
  await registration.update().catch(() => {});
  if (!registration.pushManager) throw new Error('PushManager kullanılamıyor.');
  return registration;
}

async function invokePushFunction(body) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  return supabaseClient.functions.invoke('send-push-notification', {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
}

async function saveAndSendNotification({ audience, title, body }) {
  const notification = {
    date: 'Bugün',
    title,
    body,
    audience,
    sentBy: state.userId,
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    status: 'Sırada'
  };

  try {
    const { data: pushResult, error: pushError } = await invokePushFunction({
      action: 'create-and-send',
      schoolId: state.schoolId,
      notification: { audience, title, body }
    });
    if (pushError) throw pushError;
    notification.id = Number(pushResult.notificationId);
    notification.status = pushResult.sent > 0 ? 'Teslim edildi' : 'Başarısız';
    notification.recipientCount = Number(pushResult.recipients || 0);
    notification.deliveredCount = Number(pushResult.sent || 0);
    notification.readCount = 0;
    state.notifications.unshift(notification);
    persistLocalData();
    return { notification, sent: Number(pushResult.sent || 0) };
  } catch (error) {
    throw error;
  }
}

async function createTrainingAndSendNotification(training) {
  const { data: result, error } = await invokePushFunction({
    action: 'create-training-and-send',
    schoolId: state.schoolId,
    training
  });
  if (error) throw error;
  if (!result?.trainingId) throw new Error(result?.error || 'Antrenman oluşturulamadı.');

  const notification = {
    id: Number(result.notificationId),
    date: 'Bugün',
    title: `${training.group} grubu · Yeni antrenman`,
    body: `${formatTrainingDateLong(training.date)} saat ${training.time}’de ${training.title} antrenmanı yapılacaktır.`,
    audience: `${training.group} velileri`,
    sentBy: state.userId,
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    status: Number(result.sent || 0) > 0 ? 'Teslim edildi' : 'Başarısız',
    recipientCount: Number(result.recipients || 0),
    deliveredCount: Number(result.sent || 0),
    readCount: 0
  };
  state.notifications.unshift(notification);
  persistLocalData();
  return {
    trainingId: Number(result.trainingId),
    sent: Number(result.sent || 0),
    recipients: Number(result.recipients || 0)
  };
}

let pushStatusRefreshPromise = null;
let enablePhoneNotificationsPromise = null;

async function refreshPushStatus(shouldRender = false) {
  if (!pushStatusRefreshPromise) {
    pushStatusRefreshPromise = (async () => {
      if (runsInAndroidAppShell()) {
        if (state.nativeNotificationPermission === 'denied') {
          state.pushStatus = 'denied';
          return;
        }
        if (!state.nativeFcmToken) {
          state.pushStatus = 'checking';
          return;
        }
        if (window.localStorage.getItem(PUSH_PREFERENCE_STORAGE_KEY) === 'disabled') {
          state.pushStatus = 'disabled';
          return;
        }
        try {
          await registerNativeFcmToken();
          window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
          state.pushStatus = 'enabled';
        } catch (error) {
          console.error('Firebase bildirim kaydı tamamlanamadı:', error);
          state.pushStatus = 'disabled';
        }
        return;
      }
      if (!pushSupported()) {
        state.pushStatus = 'unsupported';
        return;
      }
      const permission = currentPushPermission();
      if (permission === 'unsupported') {
        state.pushStatus = 'unsupported';
        return;
      }
      let registration;
      let subscription;
      try {
        registration = await getPushRegistration();
        subscription = await registration.pushManager.getSubscription();
      } catch (error) {
        console.error('Bildirim altyapısı kullanılamıyor:', error);
        state.pushStatus = 'unsupported';
        return;
      }

      if (subscription) {
        state.pushStatus = 'enabled';
        window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
        if (state.userId) {
          try {
            await savePushSubscription(subscription);
          } catch (error) {
            console.warn('Bildirim aboneliği yenilenemedi; mevcut abonelik korunuyor:', error);
          }
        }
        return;
      }

      if (permission === 'denied') {
        state.pushStatus = 'denied';
        return;
      }

      try {
        const pushPreference = window.localStorage.getItem(PUSH_PREFERENCE_STORAGE_KEY);
        if (pushPreference !== 'disabled' && permission === 'granted' && state.userId) {
          let shouldRestoreSubscription = runsInAndroidAppShell();
          if (!shouldRestoreSubscription) {
            const { count, error: countError } = await supabaseClient
              .from('push_subscriptions')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', state.userId);
            if (countError) throw countError;
            shouldRestoreSubscription = Number(count || 0) > 0;
          }
          if (shouldRestoreSubscription) {
            subscription = await createAndSavePushSubscription(registration);
            window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
          }
        }
        state.pushStatus = subscription ? 'enabled' : 'disabled';
      } catch (error) {
        console.error('Bildirim durumu kontrol edilemedi:', error);
        state.pushStatus = 'disabled';
      }
    })();
  }
  const activeRefresh = pushStatusRefreshPromise;
  try {
    await activeRefresh;
  } finally {
    if (pushStatusRefreshPromise === activeRefresh) pushStatusRefreshPromise = null;
  }
  if ((shouldRender || state.page === 'notifications') && !appShell.classList.contains('is-hidden')) render();
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
}

async function savePushSubscription(subscription) {
  const serialized = subscription.toJSON();
  const { error } = await supabaseClient.rpc('register_push_subscription', {
    subscription_endpoint: serialized.endpoint,
    subscription_p256dh: serialized.keys?.p256dh,
    subscription_auth_secret: serialized.keys?.auth,
    subscription_user_agent: navigator.userAgent
  });
  if (error) throw error;
}

async function createAndSavePushSubscription(registration) {
  const { data, error } = await invokePushFunction({ action: 'public-key' });
  if (error || !data?.publicKey) throw new Error(error?.message || 'Bildirim anahtarı alınamadı.');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey)
  });
  await savePushSubscription(subscription);
  return subscription;
}

async function enablePhoneNotifications() {
  if (enablePhoneNotificationsPromise) return enablePhoneNotificationsPromise;
  enablePhoneNotificationsPromise = (async () => {
    if (runsInAndroidAppShell()) {
      if (state.nativeNotificationPermission !== 'granted') {
        state.pushStatus = state.nativeNotificationPermission === 'denied' ? 'denied' : 'unsupported';
        throw new Error('Android bildirim izni verilmedi. Telefon ayarlarından SASA-F bildirimlerini açın.');
      }
      if (!state.nativeFcmToken) {
        state.pushStatus = 'checking';
        throw new Error('Firebase bildirim anahtarı henüz hazırlanıyor. Uygulamayı kapatıp yeniden açın.');
      }
      await registerNativeFcmToken();
      window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
      state.pushStatus = 'enabled';
      return;
    }
    if (!pushSupported()) throw new Error('Bu tarayıcı telefon bildirimlerini desteklemiyor. iPhone’da uygulamayı Ana Ekran’a ekleyip oradan açın.');
    const registration = await getPushRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await savePushSubscription(subscription);
      window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
      state.pushStatus = 'enabled';
      return;
    }
    let permission = currentPushPermission();
    // Android uygulama izni yerel açılış ekranında alınır. Burada yalnızca
    // web push izni istenir; böylece toggle tek bir izin penceresi gösterir.
    if (permission === 'default' && 'Notification' in window) {
      permission = await Notification.requestPermission();
    }
    if (permission === 'unsupported') throw new Error('Bu tarayıcı telefon bildirimlerini desteklemiyor.');
    if (permission !== 'granted') {
      state.pushStatus = permission === 'denied' ? 'denied' : 'disabled';
      throw new Error('Bildirim izni verilmedi.');
    }
    subscription = await createAndSavePushSubscription(registration);
    window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'enabled');
    state.pushStatus = 'enabled';
  })();
  try {
    return await enablePhoneNotificationsPromise;
  } finally {
    enablePhoneNotificationsPromise = null;
  }
}

async function disablePhoneNotifications() {
  if (runsInAndroidAppShell()) {
    await unregisterNativeFcmToken();
    window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'disabled');
    state.pushStatus = 'disabled';
    return;
  }
  const registration = await getPushRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const { error } = await supabaseClient.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    if (error) throw error;
    await subscription.unsubscribe();
  }
  window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, 'disabled');
  state.pushStatus = 'disabled';
}

async function runRemoteMutation(action) {
  try {
    await action();
    return true;
  } catch (error) {
    showToast(`Supabase kaydı tamamlanamadı: ${error.message || 'Bağlantı hatası'}`);
    return false;
  }
}

function openAttendance(id) {
  const training = state.trainings.find(item => item.id === Number(id));
  const trainingStudents = studentsForTraining(training);
  const latestAttendance = latestAttendanceForTraining(training);
  state.activeTrainingId = training.id;
  document.querySelector('#attendanceTitle').textContent = `${training.group} · ${training.title}`;
  document.querySelector('#attendanceList').innerHTML = trainingStudents.map(s => `<div class="attendance-item"><input id="attendance-${s.id}" type="checkbox" data-student-id="${s.id}" aria-label="${s.name} antrenmana katıldı" ${!latestAttendance || latestAttendance.presentStudentIds.includes(s.id) ? 'checked' : ''}><span>${studentNameLink(s)} <small class="muted">· ${s.group}</small></span></div>`).join('') || '<div class="empty-state">Bu gruba kayıtlı öğrenci bulunmuyor.</div>';
  document.querySelector('#attendanceDialog').showModal();
}

function openStudentDialog(student = null) {
  const currentPlan = SUBSCRIPTION_PLANS[state.schoolSubscriptionPlan] || SUBSCRIPTION_PLANS.standard;
  if (!student && currentPlan.studentLimit !== null && state.students.length >= currentPlan.studentLimit) {
    showToast(`${currentPlan.name} paketi en fazla ${currentPlan.studentLimit} öğrenci kaydına izin verir. Yeni kayıt için paket yükseltilmelidir.`);
    return;
  }
  const form = document.querySelector('#studentForm');
  form.reset();
  state.editingStudentId = student?.id || null;
  form.elements.studentName.value = student?.name || '';
  form.elements.birthDate.value = student ? studentBirthInputValue(student.birth) : '';
  form.elements.group.value = student?.group || '';
  form.elements.position.value = student?.position || '';
  form.elements.parentName.value = student?.parent || '';
  form.elements.phone.value = student?.phone || '';
  form.elements.email.value = student?.email || '';
  form.elements.address.value = student?.address || '';
  document.querySelector('#studentEyebrow').textContent = student ? 'PROFİLİ DÜZENLE' : 'YENİ KAYIT';
  document.querySelector('#studentDialogTitle').textContent = student ? 'Öğrenci ve veli bilgilerini güncelle' : 'Öğrenci bilgileri';
  document.querySelector('#studentSubmitButton').textContent = student ? 'Değişiklikleri kaydet' : 'Öğrenciyi kaydet';
  document.querySelector('#guardianInviteHint').classList.toggle('is-hidden', Boolean(student));
  const prepaymentSection = document.querySelector('#studentPrepaymentSection');
  prepaymentSection.classList.toggle('is-hidden', Boolean(student));
  prepaymentSection.open = false;
  document.querySelector('#studentPrepaymentMonths').innerHTML = upcomingFeeMonths().map(month => `<label class="student-prepayment-month"><input type="checkbox" name="prepaymentMonth" value="${month}"><span>${formatFeeMonth(month)}</span><small>${formatCurrency(state.monthlyFeeAmount)}</small></label>`).join('');
  form.elements.prepaymentMethod.value = 'cash';
  updateStudentPrepaymentSummary();
  document.querySelector('#studentDialog').showModal();
}

function updateStudentPrepaymentSummary() {
  const form = document.querySelector('#studentForm');
  const selectedCount = form.querySelectorAll('input[name="prepaymentMonth"]:checked').length;
  document.querySelector('#studentPrepaymentSummary').textContent = selectedCount
    ? `${selectedCount} ay seçili`
    : 'İsteğe bağlı · 0 ay seçili';
  document.querySelector('#studentPrepaymentTotal').textContent = formatCurrency(selectedCount * state.monthlyFeeAmount);
}

function openTrainingDialog(training = null) {
  const form = document.querySelector('#trainingForm');
  form.reset();
  state.editingTrainingId = training?.id || null;
  form.elements.date.value = training?.date || localDateValue();
  form.elements.time.value = training?.time || '09:00';
  form.elements.group.value = training?.group || '';
  form.elements.duration.value = String(training?.duration || 90);
  form.elements.title.value = training?.title || '';
  form.elements.coach.value = training?.coach || '';
  form.elements.field.value = training?.field || '';
  document.querySelector('#trainingEyebrow').textContent = training ? 'ANTRENMANI DÜZENLE' : 'YENİ ANTRENMAN';
  document.querySelector('#trainingDialogTitle').textContent = training ? 'Antrenman bilgilerini güncelle' : 'Antrenman planla';
  document.querySelector('#trainingSubmitButton').textContent = training ? 'Değişiklikleri kaydet' : 'Antrenmanı kaydet';
  document.querySelector('#deleteTrainingButton').classList.toggle('is-hidden', !training || !isAdminRole());
  document.querySelector('#trainingDialog').showModal();
}

function openAccountingDialog(entry = null) {
  const form = document.querySelector('#accountingForm');
  form.reset();
  state.editingAccountingEntryId = entry?.id || null;
  form.elements.date.value = entry ? accountingDateInputValue(entry.date) : localDateValue();
  form.elements.kind.value = entry?.kind || '';
  form.elements.paymentMethod.value = entry?.paymentMethod || 'cash';
  form.elements.title.value = entry?.title || '';
  form.elements.amount.value = entry?.amount || '';
  document.querySelector('#accountingEyebrow').textContent = entry ? 'İŞLEMİ DÜZENLE' : 'YENİ İŞLEM';
  document.querySelector('#accountingDialogTitle').textContent = entry ? 'Muhasebe kaydını güncelle' : 'Gelir veya gider kaydı';
  document.querySelector('#accountingSubmitButton').textContent = entry ? 'Değişiklikleri kaydet' : 'İşlemi kaydet';
  document.querySelector('#accountingDialog').showModal();
}

function updateFeePaymentFields() {
  const form = document.querySelector('#feeDefinitionForm');
  const paid = form.elements.status.value === 'paid';
  form.querySelectorAll('.fee-payment-field').forEach(field => field.classList.toggle('is-hidden', !paid));
  form.elements.paymentDate.required = paid;
  form.elements.paymentMethod.required = paid;
}

function openFeeDefinitionDialog() {
  const form = document.querySelector('#feeDefinitionForm');
  form.reset();
  form.elements.studentSearch.value = '';
  form.elements.studentId.value = '';
  document.querySelector('#feeDefinitionStudentResults').classList.add('is-hidden');
  document.querySelector('#feeDefinitionStudentResults').innerHTML = '';
  form.elements.studentSearch.setAttribute('aria-expanded', 'false');
  form.elements.period.value = feeMonthKey();
  form.elements.amount.value = String(state.monthlyFeeAmount);
  form.elements.status.value = 'late';
  form.elements.paymentDate.value = localDateValue();
  form.elements.paymentMethod.value = 'cash';
  updateFeePaymentFields();
  document.querySelector('#feeDefinitionDialog').showModal();
}

function openFeePaymentDialog(student, month) {
  const form = document.querySelector('#feePaymentForm');
  form.reset();
  form.elements.studentId.value = String(student.id);
  form.elements.period.value = month;
  form.elements.paymentDate.value = localDateValue();
  form.elements.paymentMethod.value = 'cash';
  document.querySelector('#feePaymentDescription').textContent = `${student.name} · ${formatFeeMonth(month)} · ${formatCurrency(monthlyFeeAmount(student, month))}`;
  document.querySelector('#feePaymentDialog').showModal();
}

function updateFeeDefinitionStudentResults() {
  const form = document.querySelector('#feeDefinitionForm');
  const searchValue = form.elements.studentSearch.value.trim().toLocaleLowerCase('tr-TR');
  const results = document.querySelector('#feeDefinitionStudentResults');
  form.elements.studentId.value = '';
  const matches = searchValue
    ? [...state.students]
        .filter(student => `${student.name} ${student.group} ${studentBirthYearLabel(student)}`.toLocaleLowerCase('tr-TR').includes(searchValue))
        .sort((left, right) => left.name.localeCompare(right.name, 'tr-TR'))
        .slice(0, 8)
    : [];
  results.innerHTML = matches.map(student => `<button class="student-search-option" type="button" role="option" data-action="select-fee-student" data-id="${student.id}"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.group)} · ${escapeHtml(studentBirthYearLabel(student))}</small></button>`).join('');
  results.classList.toggle('is-hidden', matches.length === 0);
  form.elements.studentSearch.setAttribute('aria-expanded', String(matches.length > 0));
}

function closeLedgerActions() {
  document.querySelectorAll('.ledger-entry.show-actions').forEach(item => {
    item.classList.remove('show-actions');
    item.querySelector('.ledger-menu-button')?.setAttribute('aria-expanded', 'false');
  });
}

function toggleLedgerActions(row) {
  const shouldOpen = !row.classList.contains('show-actions');
  closeLedgerActions();
  if (shouldOpen) {
    row.classList.add('show-actions');
    row.querySelector('.ledger-menu-button')?.setAttribute('aria-expanded', 'true');
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabaseClient || authRequestPending) return;
  showAuthMessage();
  setAuthPending(true);

  if (authMode === 'reset-password') {
    const email = loginEmail.value.trim();
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT_URL });
    setAuthPending(false);
    showAuthMessage(error ? friendlyAuthError(error) : 'Şifre yenileme bağlantısı e-posta adresinize gönderildi.', Boolean(error));
    return;
  }

  if (authMode === 'signup') {
    if (loginPassword.value !== loginPasswordConfirm.value) {
      setAuthPending(false);
      showAuthMessage('Şifreler birbiriyle aynı olmalıdır.', true);
      return;
    }
    if (loginPassword.value.length < 8) {
      setAuthPending(false);
      showAuthMessage('Şifreniz en az 8 karakter olmalıdır.', true);
      return;
    }
    const { error } = await supabaseClient.auth.signUp({
      email: loginEmail.value.trim(),
      password: loginPassword.value,
      options: {
        data: {
          full_name: signupFullName.value.trim(),
          access_request: true
        }
      }
    });
    if (error) {
      setAuthPending(false);
      showAuthMessage(friendlyAuthError(error), true);
      return;
    }
    showLoginScreen('Kayıt talebiniz oluşturuldu ve Süper Admin onayına gönderildi. Onaylandıktan sonra giriş yapabilirsiniz.');
    return;
  }

  if (authMode === 'set-password') {
    if (loginPassword.value !== loginPasswordConfirm.value) {
      setAuthPending(false);
      showAuthMessage('Şifreler birbiriyle aynı olmalıdır.', true);
      return;
    }
    if (loginPassword.value.length < 8) {
      setAuthPending(false);
      showAuthMessage('Şifreniz en az 8 karakter olmalıdır.', true);
      return;
    }
    authMode = 'login';
    const { data, error } = await supabaseClient.auth.updateUser({ password: loginPassword.value });
    if (error) {
      authMode = 'set-password';
      setAuthPending(false);
      showAuthMessage(friendlyAuthError(error), true);
      return;
    }
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    await showAuthenticatedApp(data.user);
    showToast('Şifreniz kaydedildi. Hesabınız kullanıma hazır.');
    return;
  }

  openDashboardAfterPasswordLogin = true;
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: loginEmail.value.trim(),
    password: loginPassword.value
  });
  if (error) {
    openDashboardAfterPasswordLogin = false;
    setAuthPending(false);
    showAuthMessage(friendlyAuthError(error), true);
    return;
  }
  await showAuthenticatedApp(data.user);
});

document.querySelector('#forgotPasswordButton').addEventListener('click', () => configureAuthForm('reset-password'));
document.querySelector('#backToLoginButton').addEventListener('click', () => configureAuthForm('login'));

document.querySelector('#logoutButton').addEventListener('click', logout);
globalBackButton.addEventListener('click', requestAppBack);
window.addEventListener('popstate', event => {
  if (!state.userId || appShell.classList.contains('is-hidden')) return;
  if (restoreBrowserNavigation(event.state)) return;
  if (state.page !== 'dashboard') goBack();
});
document.querySelector('#menuButton').addEventListener('click', () => document.querySelector('#sidebar').classList.add('open'));
document.querySelector('#sidebarScrim').addEventListener('click', () => document.querySelector('#sidebar').classList.remove('open'));
document.querySelector('#schoolSelect').addEventListener('change', async event => {
  const previousSchoolId = state.schoolId;
  const changed = await switchSchool(event.target.value);
  if (!changed) event.target.value = previousSchoolId;
});
document.querySelector('#rolePreviewSelect').addEventListener('change', event => {
  if (!isActualSuperAdmin()) return;
  const previewRole = String(event.target.value || 'super_admin');
  if (!roleNames[previewRole]) return;
  state.role = previewRole;
  state.page = 'dashboard';
  state.pageHistory = [];
  state.selectedStudentId = null;
  state.selectedParentStudentId = state.students[0]?.id || null;
  state.notificationComposeOpen = false;
  initializeBrowserNavigation();
  render();
  showToast(previewRole === 'super_admin'
    ? 'Süper Admin ekranına dönüldü.'
    : `${roleNames[previewRole]} ekranı önizleniyor; gerçek yetkiniz değişmedi.`);
});

document.addEventListener('click', async event => {
  const dialogCloseButton = event.target.closest('[data-dialog-close]');
  if (dialogCloseButton) { const dialog = document.querySelector(`#${dialogCloseButton.dataset.dialogClose}`); if (dialog?.open) dialog.close(); dialog?.querySelector('form')?.reset(); if (dialog?.id === 'studentDialog') state.editingStudentId = null; if (dialog?.id === 'trainingDialog') state.editingTrainingId = null; if (dialog?.id === 'accountingDialog') state.editingAccountingEntryId = null; if (dialog?.id === 'schoolAdminDialog') state.invitingSchoolId = null; if (dialog?.id === 'schoolEditDialog') state.editingSchoolId = null; if (dialog?.id === 'subscriptionDialog') state.editingSubscriptionSchoolId = null; if (dialog?.id === 'feePaymentDialog') render(); return; }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton && appShell.contains(pageButton)) {
    if (pageButton.dataset.page === 'schools' && state.role === 'super_admin') {
      try { await refreshSchools(); } catch (error) { showToast(`Okul özeti yenilenemedi: ${error.message || 'Bağlantı hatası'}`); }
    }
    navigateToPage(pageButton.dataset.page, pageButton.dataset.page === 'fees' ? { feeFilter: 'all' } : {});
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) {
    closeLedgerActions();
    return;
  }
  const action = actionButton.dataset.action;
  if (action === 'select-school' && state.role === 'super_admin') {
    await switchSchool(actionButton.dataset.id);
  }
  else if (action === 'invite-school-admin' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school?.active) return;
    state.invitingSchoolId = school.id;
    const form = document.querySelector('#schoolAdminForm');
    form.reset();
    form.elements.schoolId.value = school.id;
    document.querySelector('#schoolAdminDialogDescription').textContent = `${school.name} için Admin veya Antrenör hesabı oluşturulur.`;
    document.querySelector('#schoolAdminDialog').showModal();
    window.setTimeout(() => form.elements.fullName.focus(), 0);
  }
  else if (action === 'rename-school' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school) return;
    state.editingSchoolId = school.id;
    const form = document.querySelector('#schoolEditForm');
    form.reset();
    form.elements.schoolId.value = school.id;
    form.elements.schoolName.value = school.name;
    document.querySelector('#schoolEditDialog').showModal();
    window.setTimeout(() => form.elements.schoolName.focus(), 0);
  }
  else if (action === 'toggle-school-status' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school) return;
    const nextActive = !school.active;
    if (!nextActive && !window.confirm(`“${school.name}” pasife alınsın mı? Veriler silinmeyecek.`)) return;
    const updated = await runRemoteMutation(() => remoteDataStore.updateSchool({ id: school.id, name: school.name, active: nextActive }));
    if (!updated) return;
    school.active = updated.is_active !== false;
    render();
    showToast(school.active ? 'Okul yeniden aktifleştirildi.' : 'Okul pasife alındı; verileri korunuyor.');
  }
  else if (action === 'edit-subscription' && state.role === 'super_admin') {
    const school = state.schools.find(item => item.id === actionButton.dataset.id);
    if (!school) return;
    state.editingSubscriptionSchoolId = school.id;
    const form = document.querySelector('#subscriptionForm');
    form.reset();
    form.elements.schoolId.value = school.id;
    form.elements.plan.value = school.subscriptionPlan || 'standard';
    form.elements.status.value = school.subscriptionStatus || 'trial';
    form.elements.monthlyPrice.value = SUBSCRIPTION_PLANS[form.elements.plan.value]?.price || 799;
    form.elements.startsOn.value = school.subscriptionStartsOn || '';
    form.elements.endsOn.value = school.subscriptionEndsOn || '';
    document.querySelector('#subscriptionDialogSchoolName').textContent = school.name;
    document.querySelector('#subscriptionDialog').showModal();
  }
  else if (action === 'select-fee-student') {
    const student = state.students.find(item => item.id === Number(actionButton.dataset.id));
    if (!student) return;
    const form = document.querySelector('#feeDefinitionForm');
    form.elements.studentSearch.value = `${student.name} · ${student.group} · ${studentBirthYearLabel(student)}`;
    form.elements.studentId.value = student.id;
    document.querySelector('#feeDefinitionStudentResults').classList.add('is-hidden');
    form.elements.studentSearch.setAttribute('aria-expanded', 'false');
  }
  else if (action === 'add-student' && ['super_admin', 'admin'].includes(state.role)) openStudentDialog();
  else if (action === 'edit-profile' && ['super_admin', 'admin'].includes(state.role)) { const student = state.students.find(item => item.id === Number(state.selectedStudentId)); if (student) openStudentDialog(student); }
  else if (action === 'new-training' && ['super_admin', 'admin'].includes(state.role)) openTrainingDialog();
  else if (action === 'edit-training' && isAdminRole()) { const training = state.trainings.find(item => item.id === Number(actionButton.dataset.id)); if (training) openTrainingDialog(training); }
  else if (action === 'delete-training' && isAdminRole()) {
    const training = state.trainings.find(item => item.id === Number(state.editingTrainingId));
    if (training && window.confirm(`“${training.title}” antrenmanı silinsin mi? Bu antrenmana ait yoklama kayıtları da silinecektir.`)) {
      const saved = await runRemoteMutation(() => remoteDataStore.deleteTraining(training.id));
      if (!saved) return;
      state.trainings = state.trainings.filter(item => item.id !== training.id);
      state.attendanceRecords = state.attendanceRecords.filter(record => Number(record.trainingId) !== Number(training.id));
      state.editingTrainingId = null;
      persistLocalData();
      document.querySelector('#trainingDialog').close();
      render();
      try {
        const pushResult = await saveAndSendNotification({
          audience: `${training.group} velileri`,
          title: `${training.group} grubu · Antrenman iptal edildi`,
          body: `${formatTrainingDateLong(training.date)} saat ${training.time}’de yapılması planlanan ${training.title} antrenmanı iptal edilmiştir. Saha: ${training.field}.`
        });
        render();
        showToast(pushResult.sent > 0
          ? `Antrenman silindi ve ${pushResult.sent} telefona iptal bildirimi gönderildi.`
          : 'Antrenman silindi; bu grupta bildirimi açık telefon bulunamadı.');
      } catch (error) {
        render();
        showToast(`Antrenman silindi ancak iptal bildirimi gönderilemedi: ${error.message || 'Bağlantı hatası'}`);
      }
    }
  }
  else if (action === 'new-entry' && isAdminRole()) openAccountingDialog();
  else if (action === 'collect-fee' && ['super_admin', 'admin'].includes(state.role)) openFeeDefinitionDialog();
  else if (action === 'accounting-period') { state.accountingPeriod = actionButton.dataset.period; window.localStorage.setItem('sporx_accounting_period', state.accountingPeriod); render(); }
  else if (action === 'accounting-entries') navigateToPage('accountingEntries', { accountingFilter: actionButton.dataset.kind || 'all' });
  else if (action === 'pending-fees') navigateToPage('fees', { feeFilter: 'pending' });
  else if (action === 'scroll-profile-fees') document.querySelector('#monthlyFeeSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (action === 'toggle-student-timeline') { const studentId = Number(actionButton.dataset.id); state.expandedTimelineStudentId = Number(state.expandedTimelineStudentId) === studentId ? null : studentId; render(); }
  else if (action === 'fee-filter') { state.feeFilter = actionButton.dataset.filter || 'all'; render(); }
  else if (action === 'dismiss-dashboard-notifications') {
    window.localStorage.setItem(PUSH_PROMPT_DISMISS_STORAGE_KEY, '1');
    render();
  }
  else if (action === 'toggle-phone-notifications' || action === 'enable-dashboard-notifications') {
    if (state.pushBusy) return;
    state.pushBusy = true;
    render();
    try {
      if (action === 'toggle-phone-notifications' && state.pushStatus === 'enabled') {
        await disablePhoneNotifications();
        showToast('Bu telefondaki bildirimler kapatıldı.');
      } else {
        await enablePhoneNotifications();
        window.localStorage.removeItem(PUSH_PROMPT_DISMISS_STORAGE_KEY);
        showToast('Telefon bildirimleri açıldı.');
      }
    } catch (error) {
      await refreshPushStatus();
      showToast(error.message || 'Bildirim ayarı tamamlanamadı.');
    } finally {
      state.pushBusy = false;
      render();
    }
  }
  else if (action === 'delete-notification' && isAdminRole()) {
    const notification = state.notifications.find(item => Number(item.id) === Number(actionButton.dataset.id));
    if (!notification) return;
    if (!window.confirm(`“${notification.title}” bildirimi silinsin mi?`)) return;
    const saved = await runRemoteMutation(() => remoteDataStore.deleteNotification(notification.id));
    if (!saved) return;
    state.notifications = state.notifications.filter(item => Number(item.id) !== Number(notification.id));
    persistLocalData();
    render();
    showToast('Bildirim silindi.');
  }
  else if (action === 'edit-group' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingGroupName = String(actionButton.dataset.group || '');
    render();
    window.setTimeout(() => document.querySelector('#editGroupName')?.focus(), 0);
  }
  else if (action === 'cancel-edit-group' && ['super_admin', 'admin'].includes(state.role)) {
    state.editingGroupName = null;
    render();
  }
  else if (action === 'delete-group' && ['super_admin', 'admin'].includes(state.role)) {
    const groupName = String(actionButton.dataset.group || '');
    const studentCount = state.students.filter(student => student.group === groupName).length;
    const trainingCount = state.trainings.filter(training => training.group === groupName).length;
    if (studentCount || trainingCount) {
      showToast('Bu grup kullanımda. Önce öğrenci ve antrenman kayıtlarını başka gruba taşıyın.');
      return;
    }
    if (!window.confirm(`“${groupName}” grubu silinsin mi?`)) return;
    const saved = await runRemoteMutation(() => remoteDataStore.deleteGroup(groupName));
    if (!saved) return;
    GROUPS = GROUPS.filter(group => group !== groupName);
    syncGroupOptions();
    render();
    showToast('Grup silindi.');
  }
  else if (action === 'student-sort') { const key = actionButton.dataset.sortKey; if (state.studentSortKey === key) state.studentSortDirection = state.studentSortDirection === 'asc' ? 'desc' : 'asc'; else { state.studentSortKey = key; state.studentSortDirection = key === 'enrollmentDate' ? 'desc' : 'asc'; } updateStudentsTable(); updateStudentSortHeaders(); }
  else if (action === 'monthly-fee-sort') {
    const key = actionButton.dataset.sortKey;
    if (state.monthlyFeeSortKey === key) state.monthlyFeeSortDirection = state.monthlyFeeSortDirection === 'asc' ? 'desc' : 'asc';
    else {
      state.monthlyFeeSortKey = key;
      state.monthlyFeeSortDirection = ['period', 'due'].includes(key) ? 'desc' : 'asc';
    }
    render();
  }
  else if (action === 'fee-list-sort') {
    const key = actionButton.dataset.sortKey;
    if (state.feeListSortKey === key) state.feeListSortDirection = state.feeListSortDirection === 'asc' ? 'desc' : 'asc';
    else {
      state.feeListSortKey = key;
      state.feeListSortDirection = ['period', 'due'].includes(key) ? 'desc' : 'asc';
    }
    render();
  }
  else if (action === 'approve-user' && state.role === 'super_admin') {
    const request = state.accessRequests.find(item => item.id === Number(actionButton.dataset.id));
    const roleControl = document.querySelector(`#approval-role-${actionButton.dataset.id}`);
    if (!request || !roleControl) return;
    if (!actionButton.checked) return;
    if (!request.emailVerifiedAt) {
      actionButton.checked = false;
      showToast('E-posta adresi doğrulanmadan kullanıcı onaylanamaz.');
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.approveAccessRequest(request.id, roleControl.value));
    if (!saved) {
      actionButton.checked = false;
      return;
    }
    request.status = 'approved';
    request.requestedRole = roleControl.value;
    request.reviewedAt = new Date().toISOString();
    render();
    showToast(`${request.fullName} kullanıcısı onaylandı.`);
  }
  else if (action === 'revoke-user-approval' && state.role === 'super_admin') {
    const request = state.accessRequests.find(item => item.id === Number(actionButton.dataset.id));
    if (!request || request.status !== 'approved') return;
    if (actionButton.checked) return;
    if (!window.confirm(`“${request.fullName}” kullanıcısının uygulama erişimi kaldırılsın mı?`)) {
      actionButton.checked = true;
      return;
    }
    const saved = await runRemoteMutation(() => remoteDataStore.revokeAccessRequestApproval(request.id));
    if (!saved) {
      actionButton.checked = true;
      return;
    }
    request.status = 'pending';
    request.reviewedAt = null;
    render();
    showToast(`${request.fullName} kullanıcısının onayı kaldırıldı.`);
  }
  else if (action === 'toggle-entry-actions') toggleLedgerActions(actionButton.closest('.ledger-entry'));
  else if (action === 'edit-entry') { const entry = state.accountingEntries.find(item => item.id === Number(actionButton.dataset.id)); closeLedgerActions(); if (entry) openAccountingDialog(entry); }
  else if (action === 'delete-entry') {
    const entry = state.accountingEntries.find(item => item.id === Number(actionButton.dataset.id));
    if (entry && window.confirm(`“${entry.title}” işlemi silinsin mi?`)) {
      const saved = await runRemoteMutation(() => remoteDataStore.deleteAccounting(entry.id));
      if (!saved) return;
      state.accountingEntries = state.accountingEntries.filter(item => item.id !== entry.id);
      persistLocalData();
      render();
      showToast('Muhasebe işlemi Supabase’den silindi.');
    }
  }
  else if (action === 'attendance') openAttendance(actionButton.dataset.id);
  else if (action === 'profile') { const studentDialog = document.querySelector('#studentDialog'); const attendanceDialog = document.querySelector('#attendanceDialog'); if (studentDialog.open) studentDialog.close(); if (attendanceDialog.open) attendanceDialog.close(); navigateToPage('studentProfile', { selectedStudentId: Number(actionButton.dataset.id), expandedTimelineStudentId: null }); }
  else showToast('Bu işlem sonraki geliştirme adımında açılacak.');
});

appContent.addEventListener('input', event => {
  if (event.target.closest('#notificationForm')) {
    if (event.target.name === 'audience') state.notificationDraft.audience = event.target.value;
    if (event.target.name === 'title') state.notificationDraft.title = event.target.value;
    if (event.target.name === 'message') state.notificationDraft.body = event.target.value;
    return;
  }
  if (!['studentSearch', 'groupFilter', 'activeStudentsOnlyFilter', 'debtStudentsOnlyFilter'].includes(event.target.id)) return;
  if (event.target.id === 'activeStudentsOnlyFilter') state.activeStudentsOnly = event.target.checked;
  if (event.target.id === 'debtStudentsOnlyFilter') state.debtStudentsOnly = event.target.checked;
  updateStudentsTable();
});

appContent.addEventListener('change', async event => {
  if (event.target.closest('#notificationForm') && event.target.name === 'audience') {
    state.notificationDraft.audience = event.target.value;
    return;
  }
  if (event.target.id === 'parentStudentSelect') {
    state.selectedParentStudentId = Number(event.target.value) || null;
    state.expandedTimelineStudentId = null;
    persistNavigationState();
    render();
    return;
  }
  if (event.target.id === 'monthlyFeeUnpaidOnlyFilter') {
    state.monthlyFeeUnpaidOnly = event.target.checked;
    render();
    return;
  }
  if (event.target.id === 'showPastTrainingsFilter') {
    state.showPastTrainings = event.target.checked;
    render();
    return;
  }
  if (event.target.id === 'showPastAttendanceFilter') {
    state.showPastAttendance = event.target.checked;
    render();
    return;
  }
  if (event.target.id === 'trainingSortSelect') {
    state.trainingSortDirection = event.target.value === 'desc' ? 'desc' : 'asc';
    render();
    return;
  }
  if (event.target.id === 'attendanceSortSelect') {
    state.attendanceSortDirection = event.target.value === 'asc' ? 'asc' : 'desc';
    persistNavigationState();
    render();
    return;
  }
  const statusControl = event.target.closest('[data-monthly-fee-status]');
  if (statusControl && ['super_admin', 'admin'].includes(state.role)) {
    const student = state.students.find(item => item.id === Number(statusControl.dataset.id));
    if (!student) return;
    const saved = await runRemoteMutation(() => remoteDataStore.saveFeeStatus(student, statusControl.dataset.month, statusControl.value, monthlyFeeAmount(student, statusControl.dataset.month)));
    if (!saved) { render(); return; }
    setMonthlyFeeStatus(student, statusControl.dataset.month, statusControl.value);
    persistLocalData();
    render();
    showToast(statusControl.value === 'late' ? 'Aidat borç bakiyesine eklendi.' : 'Bu dönem için aidat kaldırıldı.');
    return;
  }
  const paymentControl = event.target.closest('[data-monthly-fee]');
  if (!paymentControl || !['super_admin', 'admin'].includes(state.role)) return;
  const student = state.students.find(item => item.id === Number(paymentControl.dataset.id));
  if (!student) return;
  if (paymentControl.checked) {
    openFeePaymentDialog(student, paymentControl.dataset.month);
    return;
  }
  const status = paymentControl.checked ? 'paid' : 'late';
  const saved = await runRemoteMutation(() => remoteDataStore.saveFeeStatus(student, paymentControl.dataset.month, status, monthlyFeeAmount(student, paymentControl.dataset.month)));
  if (!saved) { render(); return; }
  setMonthlyFeeStatus(student, paymentControl.dataset.month, status);
  persistLocalData();
  render();
  showToast(paymentControl.checked ? 'Aidat ödendi; tahsilat muhasebeye gelir olarak eklendi.' : 'Ödeme kaldırıldı; aidat borç bakiyesine geri eklendi.');
});

document.querySelector('#studentPrepaymentMonths').addEventListener('change', updateStudentPrepaymentSummary);
document.querySelector('#schoolAdminForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.role !== 'super_admin') return;
  const data = new FormData(event.currentTarget);
  const schoolId = String(data.get('schoolId') || '');
  const fullName = String(data.get('fullName') || '').trim();
  const email = String(data.get('email') || '').trim().toLowerCase();
  const role = String(data.get('role') || '');
  if (!state.schools.some(school => school.id === schoolId && school.active) || !fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin', 'coach'].includes(role)) {
    showToast('Kullanıcı adı, e-posta adresi ve rolü kontrol edin.');
    return;
  }
  const result = await runRemoteMutation(() => remoteDataStore.inviteSchoolAdmin({ schoolId, fullName, email, role }));
  if (!result) return;
  await refreshSchools();
  state.invitingSchoolId = null;
  document.querySelector('#schoolAdminDialog').close();
  event.currentTarget.reset();
  render();
  const roleLabel = roleNames[role];
  showToast(result.status === 'invited' ? `${roleLabel} daveti ${email} adresine gönderildi.` : `Mevcut kullanıcı ${roleLabel} olarak yetkilendirildi.`);
});
document.querySelector('#schoolEditForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.role !== 'super_admin') return;
  const data = new FormData(event.currentTarget);
  const school = state.schools.find(item => item.id === String(data.get('schoolId') || ''));
  const name = String(data.get('schoolName') || '').trim();
  if (!school || !name || name.length > 120) {
    showToast('Geçerli bir okul adı girin.');
    return;
  }
  if (name === school.name) {
    state.editingSchoolId = null;
    document.querySelector('#schoolEditDialog').close();
    return;
  }
  const updated = await runRemoteMutation(() => remoteDataStore.updateSchool({ id: school.id, name, active: school.active }));
  if (!updated) return;
  school.name = updated.name || name;
  if (school.id === state.schoolId) state.schoolName = school.name;
  state.editingSchoolId = null;
  document.querySelector('#schoolEditDialog').close();
  event.currentTarget.reset();
  render();
  showToast('Okul adı güncellendi.');
});
document.querySelector('#subscriptionForm [name="plan"]').addEventListener('change', event => {
  document.querySelector('#subscriptionForm [name="monthlyPrice"]').value = SUBSCRIPTION_PLANS[event.target.value]?.price || '';
});
document.querySelector('#subscriptionForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.role !== 'super_admin') return;
  const data = new FormData(event.currentTarget);
  const schoolId = String(data.get('schoolId') || '');
  const plan = String(data.get('plan') || '');
  const status = String(data.get('status') || '');
  const monthlyPrice = SUBSCRIPTION_PLANS[plan]?.price;
  const startsOn = String(data.get('startsOn') || '');
  const endsOn = String(data.get('endsOn') || '');
  if (!state.schools.some(school => school.id === schoolId) || !SUBSCRIPTION_PLANS[plan] || !SUBSCRIPTION_STATUSES[status] || !Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    showToast('Paket ve abonelik bilgilerini kontrol edin.');
    return;
  }
  if (startsOn && endsOn && endsOn < startsOn) {
    showToast('Bitiş tarihi başlangıç tarihinden önce olamaz.');
    return;
  }
  const saved = await runRemoteMutation(() => remoteDataStore.updateSchoolSubscription({ schoolId, plan, status, startsOn: startsOn || null, endsOn: endsOn || null }));
  if (!saved) return;
  await refreshSchools();
  if (schoolId === state.schoolId) state.schoolSubscriptionPlan = plan;
  state.editingSubscriptionSchoolId = null;
  document.querySelector('#subscriptionDialog').close();
  event.currentTarget.reset();
  render();
  showToast('Paket ve abonelik bilgileri güncellendi.');
});
document.querySelector('#studentForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['super_admin', 'admin'].includes(state.role)) return;
  const data = new FormData(event.currentTarget);
  const studentData = { name: data.get('studentName').trim(), birth: formatStudentBirthDate(data.get('birthDate')), group: data.get('group'), position: data.get('position'), parent: data.get('parentName').trim(), phone: data.get('phone').trim(), email: data.get('email').trim(), address: data.get('address').trim() };
  const wasEditing = Boolean(state.editingStudentId);
  const currentPlan = SUBSCRIPTION_PLANS[state.schoolSubscriptionPlan] || SUBSCRIPTION_PLANS.standard;
  if (!wasEditing && currentPlan.studentLimit !== null && state.students.length >= currentPlan.studentLimit) {
    showToast(`${currentPlan.name} paketinin ${currentPlan.studentLimit} öğrenci sınırına ulaşıldı.`);
    return;
  }
  const prepaymentMonths = wasEditing
    ? []
    : [...new Set(data.getAll('prepaymentMonth').map(String).filter(month => /^\d{4}-\d{2}$/.test(month)))];
  const prepaymentMethod = String(data.get('prepaymentMethod') || 'cash');
  if (prepaymentMonths.length && !PAYMENT_METHODS[prepaymentMethod]) {
    showToast('Ön ödeme yöntemini kontrol edin.');
    return;
  }
  const existingStudent = wasEditing ? state.students.find(item => item.id === Number(state.editingStudentId)) : null;
  const previousStudentEmail = existingStudent?.email || '';
  const studentEmailChanged = wasEditing && previousStudentEmail.toLocaleLowerCase('tr') !== studentData.email.toLocaleLowerCase('tr');
  const enrollmentDate = existingStudent?.enrollmentDate || localDateValue();
  const studentRecord = {
    ...(existingStudent || {}),
    ...studentData,
    enrollmentDate,
    feeTrackingStartDate: existingStudent?.feeTrackingStartDate || `${feeMonthKey()}-01`,
    feePayments: existingStudent?.feePayments || { [feeMonthKey()]: 'none' },
    feeHistory: existingStudent?.feeHistory || {},
    fee: existingStudent?.fee || 'none',
    attendance: existingStudent?.attendance ?? 100
  };
  const saved = await runRemoteMutation(async () => {
    studentRecord.id = await remoteDataStore.saveStudent(studentRecord, !wasEditing);
  });
  if (!saved) return;
  if (wasEditing) {
    Object.assign(existingStudent, studentRecord);
    if (previousStudentEmail && studentRecord.email && previousStudentEmail.toLocaleLowerCase('tr') !== studentRecord.email.toLocaleLowerCase('tr')) {
      state.accessRequests.forEach(request => {
        if (request.requestedRole === 'parent' && String(request.email || '').toLocaleLowerCase('tr') === previousStudentEmail.toLocaleLowerCase('tr')) {
          request.email = studentRecord.email;
          request.emailVerifiedAt = null;
        }
      });
    }
  } else {
    state.students.unshift(studentRecord);
  }
  const savedPrepaymentMonths = [];
  const failedPrepaymentMonths = [];
  if (!wasEditing && prepaymentMonths.length) {
    for (const month of prepaymentMonths) {
      const paymentDetails = {
        amount: state.monthlyFeeAmount,
        paymentDate: localDateValue(),
        paymentMethod: prepaymentMethod
      };
      try {
        await remoteDataStore.saveFeeStatus(studentRecord, month, 'paid', state.monthlyFeeAmount, paymentDetails);
        setMonthlyFeeStatus(studentRecord, month, 'paid', paymentDetails);
        savedPrepaymentMonths.push(month);
      } catch {
        failedPrepaymentMonths.push(month);
      }
    }
  }
  let guardianInviteResult = null;
  let guardianInviteError = null;
  if (!wasEditing || studentEmailChanged) {
    try {
      guardianInviteResult = await remoteDataStore.inviteGuardian(studentRecord.id, previousStudentEmail);
    } catch (error) {
      guardianInviteError = error;
    }
  }
  state.editingStudentId = null;
  persistLocalData();
  document.querySelector('#studentDialog').close();
  event.currentTarget.reset();
  state.page = wasEditing ? 'studentProfile' : 'students';
  render();
  if (wasEditing) {
    if (studentEmailChanged && guardianInviteError) {
      showToast(`Öğrenci profili güncellendi ancak yeni veli daveti gönderilemedi: ${guardianInviteError.message || 'Bağlantı hatası'}`);
    } else if (studentEmailChanged && guardianInviteResult?.status === 'invited') {
      showToast(`Öğrenci profili güncellendi. Doğrulama daveti ${studentRecord.email} adresine gönderildi.`);
    } else {
      showToast('Öğrenci profili Supabase’de güncellendi.');
    }
  } else if (failedPrepaymentMonths.length) {
    showToast(`Öğrenci kaydedildi; ${savedPrepaymentMonths.length}/${prepaymentMonths.length} aylık ön ödeme işlendi. Kaydedilemeyen dönemleri profilden tekrar tanımlayın.`);
  } else if (guardianInviteError) {
    showToast(`Öğrenci kaydedildi${savedPrepaymentMonths.length ? ` ve ${savedPrepaymentMonths.length} aylık ön ödeme işlendi` : ''}; veli daveti gönderilemedi: ${guardianInviteError.message || 'Bağlantı hatası'}`);
  } else if (guardianInviteResult?.status === 'invited') {
    showToast(`Öğrenci kaydedildi${savedPrepaymentMonths.length ? ` ve ${savedPrepaymentMonths.length} aylık ön ödeme işlendi` : ''}. Veli daveti ${studentRecord.email} adresine gönderildi.`);
  } else if (guardianInviteResult?.status === 'pending_approval') {
    showToast(`Öğrenci kaydedildi${savedPrepaymentMonths.length ? ` ve ${savedPrepaymentMonths.length} aylık ön ödeme işlendi` : ''}. Veli hesabı Süper Admin onayı bekliyor.`);
  } else {
    showToast(`Öğrenci kaydedildi${savedPrepaymentMonths.length ? ` ve ${savedPrepaymentMonths.length} aylık ön ödeme işlendi` : ''}; mevcut veli hesabına bağlandı.`);
  }
});
document.querySelector('#attendanceForm').addEventListener('submit', async event => {
  event.preventDefault();
  const presentStudentIds = [...document.querySelectorAll('#attendanceList [data-student-id]:checked')].map(input => Number(input.dataset.studentId));
  const training = state.trainings.find(item => Number(item.id) === Number(state.activeTrainingId));
  const allStudentIds = training ? studentsForTraining(training).map(student => student.id) : [];
  let sessionId;
  const saved = await runRemoteMutation(async () => {
    sessionId = await remoteDataStore.saveAttendance(state.activeTrainingId, allStudentIds, presentStudentIds);
  });
  if (!saved) return;
  state.attendanceRecords = state.attendanceRecords.filter(record => Number(record.trainingId) !== Number(state.activeTrainingId));
  state.attendanceRecords.unshift({ id: sessionId, trainingId: state.activeTrainingId, date: new Date().toISOString(), presentStudentIds });
  persistLocalData();
  document.querySelector('#attendanceDialog').close();
  render();
  showToast('Yoklama Supabase’e kaydedildi.');
});
document.querySelector('#trainingForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['super_admin', 'admin'].includes(state.role)) return;
  const data = new FormData(event.currentTarget);
  const group = data.get('group');
  const trainingData = {
    date: data.get('date'),
    time: data.get('time'),
    duration: Number(data.get('duration')),
    group,
    title: data.get('title').trim(),
    coach: data.get('coach').trim(),
    field: data.get('field').trim()
  };
  const wasEditing = Boolean(state.editingTrainingId);
  const existingTraining = wasEditing ? state.trainings.find(item => item.id === Number(state.editingTrainingId)) : null;
  const trainingRecord = { ...(existingTraining || {}), ...trainingData };
  let pushResult = null;
  const saved = await runRemoteMutation(async () => {
    if (wasEditing) {
      trainingRecord.id = await remoteDataStore.saveTraining(trainingRecord, false);
    } else {
      pushResult = await createTrainingAndSendNotification(trainingRecord);
      trainingRecord.id = pushResult.trainingId;
    }
  });
  if (!saved) return;
  if (wasEditing) {
    Object.assign(existingTraining, trainingRecord);
  } else {
    state.trainings.push(trainingRecord);
  }
  state.editingTrainingId = null;
  persistLocalData();
  document.querySelector('#trainingDialog').close();
  event.currentTarget.reset();
  state.page = 'trainings';
  render();
  if (wasEditing) {
    showToast('Antrenman Supabase’de güncellendi.');
    return;
  }
  showToast(pushResult.sent > 0
    ? `Antrenman kaydedildi ve ${pushResult.sent} telefona bildirim gönderildi.`
    : pushResult.recipients > 0
      ? 'Antrenman kaydedildi ancak gruptaki telefonlara bildirim ulaştırılamadı.'
      : 'Antrenman kaydedildi; bu grupta bildirimi açık veli hesabı bulunamadı.');
});
document.querySelector('#feeDefinitionStatus').addEventListener('change', updateFeePaymentFields);
document.querySelector('#feeDefinitionStudentSearch').addEventListener('input', updateFeeDefinitionStudentResults);
document.querySelector('#feePaymentDialog').addEventListener('cancel', () => window.setTimeout(render, 0));
document.querySelector('#feePaymentForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['super_admin', 'admin'].includes(state.role)) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const student = state.students.find(item => item.id === Number(data.get('studentId')));
  const month = String(data.get('period') || '');
  const paymentDate = String(data.get('paymentDate') || '');
  const paymentMethod = String(data.get('paymentMethod') || '');
  if (!student || !/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !PAYMENT_METHODS[paymentMethod]) {
    showToast('Öğrenci, dönem, ödeme tarihi veya tahsilat tipi bilgisini kontrol edin.');
    return;
  }
  const paymentDetails = { paymentDate, paymentMethod };
  const amount = monthlyFeeAmount(student, month);
  const saved = await runRemoteMutation(() => remoteDataStore.saveFeeStatus(student, month, 'paid', amount, paymentDetails));
  if (!saved) { render(); return; }
  setMonthlyFeeStatus(student, month, 'paid', paymentDetails);
  persistLocalData();
  document.querySelector('#feePaymentDialog').close();
  form.reset();
  render();
  showToast(`Aidat ${PAYMENT_METHODS[paymentMethod]} olarak tahsil edildi ve muhasebeye eklendi.`);
});
document.querySelector('#feeDefinitionForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['super_admin', 'admin'].includes(state.role)) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const student = state.students.find(item => item.id === Number(data.get('studentId')));
  const month = String(data.get('period') || '');
  const status = data.get('status') === 'paid' ? 'paid' : 'late';
  const amount = Number(data.get('amount'));
  if (!student) {
    showToast('Arama sonuçlarından geçerli bir öğrenci seçin.');
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(amount) || amount <= 0) {
    showToast('Dönem ve aidat tutarı bilgilerini kontrol edin.');
    return;
  }
  const paymentDetails = status === 'paid'
    ? {
        amount,
        paymentDate: String(data.get('paymentDate') || ''),
        paymentMethod: String(data.get('paymentMethod') || '')
      }
    : { amount };
  if (status === 'paid' && (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDetails.paymentDate) || !PAYMENT_METHODS[paymentDetails.paymentMethod])) {
    showToast('Ödeme tarihi ve ödeme yöntemini kontrol edin.');
    return;
  }
  const saved = await runRemoteMutation(() => remoteDataStore.saveFeeStatus(student, month, status, amount, paymentDetails));
  if (!saved) return;
  setMonthlyFeeStatus(student, month, status, paymentDetails);
  persistLocalData();
  document.querySelector('#feeDefinitionDialog').close();
  form.reset();
  render();
  showToast(status === 'paid' ? 'Aidat ödendi olarak kaydedildi ve muhasebeye eklendi.' : 'Aidat ödenmedi olarak tanımlandı.');
});
document.querySelector('#accountingForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!isAdminRole()) return;
  const data = new FormData(event.currentTarget);
  const kind = data.get('kind');
  const entryData = {
    date: data.get('date'),
    title: data.get('title').trim(),
    type: kind === 'income' ? 'Gelir' : 'Gider',
    amount: Number(data.get('amount')),
    paymentMethod: data.get('paymentMethod'),
    kind
  };
  const wasEditing = Boolean(state.editingAccountingEntryId);
  const existingEntry = wasEditing ? state.accountingEntries.find(item => item.id === Number(state.editingAccountingEntryId)) : null;
  const entryRecord = { ...(existingEntry || {}), ...entryData };
  const saved = await runRemoteMutation(async () => {
    entryRecord.id = await remoteDataStore.saveAccounting(entryRecord, !wasEditing);
  });
  if (!saved) return;
  if (wasEditing) Object.assign(existingEntry, entryRecord);
  else state.accountingEntries.unshift(entryRecord);
  state.editingAccountingEntryId = null;
  persistLocalData();
  document.querySelector('#accountingDialog').close();
  event.currentTarget.reset();
  if (state.page !== 'accountingEntries') state.page = 'accounting';
  render();
  showToast(wasEditing ? 'Muhasebe işlemi Supabase’de güncellendi.' : 'Muhasebe işlemi Supabase’e kaydedildi.');
});
appContent.addEventListener('toggle', event => {
  const details = event.target;
  if (!details.matches?.('.group-settings-panel')) return;
  if (!details.isConnected) return;
  state.groupSettingsOpen = details.open;
  if (!details.open) {
    state.newestGroupPinned = false;
    state.newestGroupName = '';
  }
}, true);
appContent.addEventListener('submit', async event => {
  if (event.target.id === 'schoolCreateForm' && state.role === 'super_admin') {
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get('schoolName') || '').trim();
    const slug = String(data.get('schoolSlug') || '').trim().toLowerCase();
    const monthlyFeeAmount = Number(data.get('monthlyFeeAmount'));
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isFinite(monthlyFeeAmount) || monthlyFeeAmount <= 0) {
      showToast('Okul adı, okul kodu ve aidat tutarını kontrol edin.');
      return;
    }
    const created = await runRemoteMutation(() => remoteDataStore.createSchool({ name, slug, monthlyFeeAmount }));
    if (!created?.id) return;
    await refreshSchools();
    event.target.reset();
    await switchSchool(created.id);
    showToast(`${name} oluşturuldu ve yönetim ekranı açıldı.`);
    return;
  }
  if (event.target.matches('.group-rename-form')) {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const currentName = String(event.target.dataset.originalGroup || '');
    const groupName = String(new FormData(event.target).get('groupName') || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(groupName)) {
      showToast('Geçerli bir grup adı girin.');
      return;
    }
    if (GROUPS.some(group => group !== currentName && group.localeCompare(groupName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu grup zaten kayıtlı.');
      return;
    }
    if (groupName === currentName) {
      state.editingGroupName = null;
      render();
      return;
    }
    const updatedGroup = await runRemoteMutation(() => remoteDataStore.updateGroup(currentName, groupName));
    if (!updatedGroup) return;
    GROUPS = GROUPS.map(group => group === currentName ? updatedGroup.name : group);
    state.students.forEach(student => { if (student.group === currentName) student.group = updatedGroup.name; });
    state.trainings.forEach(training => { if (training.group === currentName) training.group = updatedGroup.name; });
    state.editingGroupName = null;
    syncGroupOptions();
    persistLocalData();
    render();
    showToast('Grup adı güncellendi.');
    return;
  }
  if (event.target.id === 'groupSettingsForm') {
    event.preventDefault();
    if (!['super_admin', 'admin'].includes(state.role)) return;
    const groupName = String(new FormData(event.target).get('groupName') || '').trim().replace(/\s+/g, ' ');
    if (!groupName) {
      showToast('Geçerli bir grup adı girin.');
      return;
    }
    if (!/^[\p{L}\p{N} .:()\-/]{1,60}$/u.test(groupName)) {
      showToast('Grup adında desteklenmeyen karakterler var.');
      return;
    }
    if (GROUPS.some(group => group.localeCompare(groupName, 'tr-TR', { sensitivity: 'base' }) === 0)) {
      showToast('Bu grup zaten kayıtlı.');
      return;
    }
    state.newestGroupPinned = true;
    state.newestGroupName = groupName;
    const savedGroup = await runRemoteMutation(() => remoteDataStore.saveGroup(groupName));
    if (!savedGroup) {
      state.newestGroupPinned = false;
      state.newestGroupName = '';
      return;
    }
    GROUPS = [savedGroup.name, ...GROUPS.filter(group => group !== savedGroup.name)];
    state.groupSettingsOpen = true;
    state.newestGroupName = savedGroup.name;
    syncGroupOptions();
    event.target.reset();
    render();
    showToast('Yeni grup eklendi.');
    return;
  }
  if (event.target.id === 'accountingSettingsForm') {
    event.preventDefault();
    if (!isAdminRole()) return;
    const amount = Number(new FormData(event.target).get('monthlyFeeAmount'));
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Geçerli bir aylık aidat tutarı girin.');
      return;
    }
    const savedAmount = await runRemoteMutation(() => remoteDataStore.saveSchoolSettings(amount));
    if (!savedAmount) return;
    state.monthlyFeeAmount = Number(savedAmount);
    render();
    showToast('Aylık aidat tutarı kaydedildi.');
    return;
  }
  if (event.target.id !== 'notificationForm') return;
  event.preventDefault();
  if (!['super_admin', 'admin'].includes(state.role)) return;
  const data = new FormData(event.target);
  try {
    const result = await saveAndSendNotification({
      audience: data.get('audience'),
      title: data.get('title'),
      body: data.get('message')
    });
    state.notificationComposeOpen = false;
    state.notificationDraft = { audience: 'Tüm kullanıcılar', title: '', body: '' };
    event.target.reset();
    render();
    markAllNotificationsRead();
    showToast(result.sent > 0
      ? `Bildirim ${result.sent} telefona yüksek öncelikle gönderildi.`
      : 'Bildirim kaydedildi ancak açık bildirimi olan telefon bulunamadı.');
  } catch (error) {
    showToast(`Bildirim gönderilemedi: ${error.message || 'Bağlantı hatası'}`);
  }
});

appContent.addEventListener('toggle', event => {
  if (!event.target.matches('.notification-compose-disclosure')) return;
  state.notificationComposeOpen = event.target.open;
}, true);

async function handleAuthStateChange(event, session) {
  if (event === 'PASSWORD_RECOVERY') authMode = 'set-password';

  if (!session?.user) {
    stopRealtimeSync();
    const message = signedOutMessage;
    signedOutMessage = '';
    if (authMode === 'set-password') {
      authMode = 'login';
      showLoginScreen('Davet veya şifre yenileme bağlantısının süresi dolmuş. Lütfen yeni bağlantı isteyin.', true);
    } else {
      showLoginScreen(message);
    }
    return;
  }

  if (authMode === 'set-password') {
    showPasswordSetupScreen();
    return;
  }

  await showAuthenticatedApp(session.user);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.userId && !appShell.classList.contains('is-hidden')) {
    refreshPushStatus(state.page === 'notifications' || state.page === 'dashboard');
  }
});

configureAuthForm(authMode);
if (!supabaseClient) {
  showLoginScreen('Güvenli giriş hizmeti yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.', true);
} else {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => handleAuthStateChange(event, session), 0);
  });
}
