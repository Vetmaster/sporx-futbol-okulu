const APP_VERSION = '2026.07.23.34';
const PAYMENT_METHODS = { cash: 'Nakit', transfer: 'Havale', card: 'Kredi kartı' };
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
const localData = window.SporXDB.load();
const state = {
  role: 'admin',
  page: 'dashboard',
  students: localData.students,
  trainings: localData.trainings,
  accountingEntries: localData.accountingEntries,
  notifications: localData.notifications,
  attendanceRecords: localData.attendanceRecords,
  activeTrainingId: null,
  selectedStudentId: null,
  activeStudentsOnly: true,
  studentSortKey: null,
  studentSortDirection: 'asc',
  feeFilter: 'all',
  accountingFilter: 'all',
  accountingPeriod: ACCOUNTING_PERIODS.some(period => period.id === savedAccountingPeriod) ? savedAccountingPeriod : '1m',
  editingStudentId: null,
  editingTrainingId: null,
  editingAccountingEntryId: null
};

const BASE_GROUPS = ['Saat 09:00', 'Saat 10:00', 'Saat 11:00', 'Saat 12:00', 'U11', 'U12', 'U13', 'U14'];
const GROUPS = [...new Set([...BASE_GROUPS, ...localData.students.map(student => student.group).filter(Boolean)])];

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
  dashboard: { label: 'Genel Bakış', icon: '⌂', roles: ['admin', 'staff', 'parent'] },
  students: { label: 'Öğrenciler', icon: '◎', roles: ['admin', 'staff'] },
  studentProfile: { label: 'Öğrenci Profili', icon: '◎', roles: ['admin', 'staff', 'parent'], hidden: true },
  studentAttendanceHistory: { label: 'Öğrenci Yoklamaları', icon: '✓', roles: ['admin', 'staff', 'parent'], hidden: true },
  child: { label: 'Çocuğum', icon: '◎', roles: ['parent'] },
  trainings: { label: 'Antrenman', icon: '▦', roles: ['admin', 'staff', 'parent'] },
  attendance: { label: 'Yoklama', icon: '✓', roles: ['admin', 'staff'] },
  fees: { label: 'Aidat', icon: '₺', roles: ['admin', 'staff', 'parent'] },
  accounting: { label: 'Muhasebe', icon: '↗', roles: ['admin'] },
  accountingEntries: { label: 'Son İşlemler', icon: '↗', roles: ['admin'], hidden: true },
  notifications: { label: 'Bildirimler', icon: '●', roles: ['admin', 'staff', 'parent'] }
};

const roleNames = { admin: 'Admin', staff: 'Normal kullanıcı', parent: 'Öğrenci velisi' };
const pageMeta = {
  dashboard: ['Genel Bakış', 'Kulübün bugünkü durumu'], students: ['Öğrenciler', 'Kayıtlar ve öğrenci profilleri'], studentProfile: ['Öğrenci Profili', 'Öğrenci ve veli bilgilerinin tamamı'], studentAttendanceHistory: ['Öğrenci Yoklamaları', 'Geldiği ve gelmediği antrenmanlar'], child: ['Çocuğum', 'Öğrenci profili ve güncel durum'],
  trainings: ['Antrenman', 'Antrenman takvimi ve gruplar'], attendance: ['Yoklama', 'Antrenman katılım takibi'], fees: ['Aidat', 'Aylık ödeme ve tahsilat takibi'],
  accounting: ['Muhasebe', 'Temel gelir ve gider takibi'], accountingEntries: ['Son İşlemler', 'Tüm gelir ve gider kayıtları'], notifications: ['Bildirimler', 'Duyurular ve gönderim merkezi']
};

const appShell = document.querySelector('#appShell');
const authScreen = document.querySelector('#authScreen');
const appContent = document.querySelector('#appContent');
const mainNav = document.querySelector('#mainNav');
const bottomNav = document.querySelector('#bottomNav');
const roleSwitcher = document.querySelector('#roleSwitcher');
document.querySelectorAll('select[name="group"]').forEach(select => {
  const existingGroups = new Set([...select.options].map(option => option.value));
  GROUPS.filter(group => !existingGroups.has(group)).forEach(group => select.add(new Option(group, group)));
});
document.querySelector('#headerVersionLabel').textContent = `v${APP_VERSION}`;
document.querySelector('#authVersionLabel').textContent = `v${APP_VERSION}`;

function allowedItems() { return Object.entries(navItems).filter(([, item]) => item.roles.includes(state.role) && !item.hidden); }
function initials(name) { return name.split(' ').map(part => part[0]).slice(0, 2).join(''); }
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
function feeMonthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function formatFeeMonth(key) { const [year, month] = String(key).split('-').map(Number); return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)); }
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
  return Number.isFinite(Number(historicalAmount)) && historicalAmount !== null ? Number(historicalAmount) : 1500;
}
function feeAccountingReference(student, month) { return `fee:${student.id}:${month}`; }
function removeFeeAccountingEntry(student, month) {
  const reference = feeAccountingReference(student, month);
  state.accountingEntries = state.accountingEntries.filter(entry => entry.reference !== reference);
}
function addFeeAccountingEntry(student, month) {
  const reference = feeAccountingReference(student, month);
  if (state.accountingEntries.some(entry => entry.reference === reference)) return;
  state.accountingEntries.unshift({
    id: Date.now(),
    date: localDateValue(),
    title: `${student.name} · ${formatFeeMonth(month)} aidatı`,
    type: 'Gelir',
    amount: monthlyFeeAmount(student, month),
    kind: 'income',
    paymentMethod: 'cash',
    source: 'fee',
    reference,
    studentId: student.id,
    feeMonth: month
  });
}
function setMonthlyFeeStatus(student, month, status) {
  student.feePayments = { ...student.feePayments, [month]: status };
  if (month === feeMonthKey()) student.fee = status;
  if (status === 'paid') addFeeAccountingEntry(student, month);
  else removeFeeAccountingEntry(student, month);
}
function feeStatusControl(student, month, status) {
  const selectValue = status === 'none' ? 'none' : 'late';
  return `<select class="fee-status-select" data-monthly-fee-status data-id="${student.id}" data-month="${month}" aria-label="${formatFeeMonth(month)} aidat durumu"><option value="none" ${selectValue === 'none' ? 'selected' : ''}>Aidat yok</option><option value="late" ${selectValue === 'late' ? 'selected' : ''}>Ödenmedi</option></select>`;
}
function monthlyFeeRows(student) {
  const canEdit = state.role !== 'parent';
  return monthlyFeePeriods(student).map(month => {
    const status = monthlyFeeStatus(student, month);
    const history = student.feeHistory?.[month];
    const [year, monthNumber] = month.split('-');
    const amount = history?.amount !== null && history?.amount !== undefined ? formatCurrency(history.amount) : history?.note === 'Yıllık ödeme' ? 'Yıllık' : history || status === 'none' ? '—' : '₺1.500';
    const sourceNote = history?.note && !(status === 'none' && history.note === 'Aidat yok') ? `<small class="muted">${history.note}</small>` : '';
    const canSelectFeeStatus = canEdit && ['none', 'late'].includes(status);
    const statusMarkup = canSelectFeeStatus ? `${feeStatusControl(student, month, status)}${sourceNote}` : `${statusLabel(status)}${sourceNote}`;
    const paymentControl = status === 'none' ? statusLabel('none') : !['exempt', 'unknown'].includes(status) ? `<label class="fee-paid-control"><input type="checkbox" data-monthly-fee data-id="${student.id}" data-month="${month}" aria-label="${formatFeeMonth(month)} aidatını ödendi işaretle" ${status === 'paid' ? 'checked' : ''}><span>${status === 'paid' ? 'Ödendi' : 'Ödendi seç'}</span></label>` : '—';
    return `<tr><td><strong>${formatFeeMonth(month)}</strong></td><td>${amount}</td><td>05.${monthNumber}.${year}</td><td>${statusMarkup}</td>${canEdit ? `<td>${paymentControl}</td>` : ''}</tr>`;
  }).join('');
}
function formatTrainingDate(value) { return value ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(`${value}T00:00:00`)) : 'Tarih belirtilmedi'; }
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
  }).filter(Boolean).sort((a, b) => `${b.training.date || ''} ${b.training.time || ''}`.localeCompare(`${a.training.date || ''} ${a.training.time || ''}`));
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
  const feeEvents = monthlyFeePeriods(student).flatMap(month => {
    const status = monthlyFeeStatus(student, month);
    if (!['paid', 'late'].includes(status)) return [];
    const history = student.feeHistory?.[month];
    const amount = history?.amount !== null && history?.amount !== undefined ? formatCurrency(history.amount) : history?.note === 'Yıllık ödeme' ? 'Yıllık ödeme' : formatCurrency(1500);
    return [{
      date: `${month}-05`,
      title: status === 'paid' ? 'Aidat ödendi' : 'Aidat ödenmedi',
      detail: `${formatFeeMonth(month)} · ${amount}`,
      tone: status === 'paid' ? 'positive' : 'negative'
    }];
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
  return `<section class="panel student-timeline-card"><div class="panel-heading"><div><h3>Öğrenci zaman çizelgesi</h3><small class="muted">Kayıt, aidat ve yoklama hareketleri</small></div><span class="status blue">${entries.length} hareket</span></div><ol class="student-timeline">${entries.slice(0, 10).map(entry => `<li class="${entry.tone}"><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-content"><time datetime="${entry.date}">${formatTimelineDate(entry.date)}</time><strong>${entry.title}</strong><small>${entry.detail}</small></div></li>`).join('') || '<li class="timeline-empty">Henüz zaman çizelgesi hareketi bulunmuyor.</li>'}</ol></section>`;
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
  const mobileKeys = state.role === 'parent' ? ['dashboard', 'child', 'trainings', 'fees'] : ['dashboard', 'students', 'trainings', state.role === 'admin' ? 'accounting' : 'attendance'];
  bottomNav.innerHTML = mobileKeys.filter(key => navItems[key]?.roles.includes(state.role)).map(key => navMarkup(key, navItems[key])).join('');
}

function dashboardView() {
  if (state.role === 'parent') return parentDashboard();
  const activeStudents = state.students.filter(isActiveStudent);
  const pendingFeeStudents = state.students.filter(student => currentFeeStatus(student) === 'late');
  const pendingFeeAmount = pendingFeeStudents.length * 1500;
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Bugünün kulüp özeti</h2><p>20 Temmuz Pazartesi · Son güncelleme şimdi</p></div></div>
    <section class="stats-grid">
      <article class="stat-card"><span class="label">Aktif öğrenci</span><strong>${activeStudents.length} / ${state.students.length}</strong><button class="stat-link" type="button" data-page="students">${GROUPS.length} grup</button></article>
      <article class="stat-card"><span class="label">Planlanan antrenman</span><strong>${state.trainings.length}</strong><button class="stat-link" type="button" data-page="trainings">Takvime git</button></article>
      <article class="stat-card"><span class="label">Bekleyen aidat</span><strong>${formatCurrency(pendingFeeAmount)}</strong><button class="stat-link" type="button" data-action="pending-fees">${pendingFeeStudents.length} öğrenci</button></article>
      <article class="stat-card"><span class="label">Aylık net durum</span><strong>₺208.300</strong><small>+%8 geçen aya göre</small></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-heading"><h3>Planlanan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${state.trainings.map(t => `<div class="list-row"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>${t.coach} · ${t.field}</small></div><span class="status">${trainingAttendanceLabel(t)}</span></div>`).join('')}</article>
      <article class="panel"><div class="panel-heading"><h3>Kulüp performansı</h3><span class="status blue">Temmuz</span></div><div class="progress-group">
        ${progress('Aidat tahsilatı', 86)}${progress('Antrenman katılımı', 91)}${progress('Kontenjan kullanımı', 78)}
      </div></article>
    </section>
    <section class="panel"><div class="panel-heading"><h3>İşlem bekleyen aidatlar</h3><button class="text-button" data-page="fees">Tümünü gör</button></div>${pendingFeeStudents.slice(0, 5).map(s => `<div class="list-row"><span class="profile-avatar">${initials(s.name)}</span><div>${studentNameLink(s)}<small>${s.group}${s.parent ? ` · Veli: ${s.parent}` : ''}</small></div>${statusLabel(currentFeeStatus(s))}</div>`).join('')}</section>
  </div>`;
}

function progress(label, value) { return `<div><div class="progress-label"><span>${label}</span><strong>%${value}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${value}%"></div></div></div>`; }

function parentDashboard() {
  const student = state.students[0];
  const feeStatus = currentFeeStatus(student);
  const feeText = feeStatus === 'paid' ? 'Ödendi' : feeStatus === 'late' ? 'Ödenmedi' : feeStatus === 'none' ? 'Aidat yok' : 'Bekliyor';
  return `<div class="page-stack">
    <section class="panel parent-hero"><span class="profile-avatar">${initials(student.name)}</span><div><h2>Veli paneli</h2><p>${studentNameLink(student, true)} · ${student.group}${student.position ? ` · ${student.position}` : ''}</p></div><button class="secondary-button" data-action="profile" data-id="${student.id}">Profili görüntüle</button></section>
    <section class="stats-grid">
      <article class="stat-card"><span class="label">Sıradaki antrenman</span><strong>Salı 18:00</strong><small>Ana saha</small></article>
      <article class="stat-card"><span class="label">${formatFeeMonth(feeMonthKey())} aidatı</span><strong>${feeText}</strong><small>Güncel ödeme durumu</small></article>
      <article class="stat-card"><span class="label">Katılım oranı</span><strong>%${student.attendance}</strong><small>Son 30 gün</small></article>
      <article class="stat-card"><span class="label">Yeni duyuru</span><strong>2</strong><small>Okunmayı bekliyor</small></article>
    </section>
    <section class="dashboard-grid"><article class="panel"><div class="panel-heading"><h3>Yaklaşan program</h3><button class="text-button" data-page="trainings">Takvim</button></div>${state.trainings.slice(0,2).map(t => `<div class="list-row"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>Salı · ${t.field}</small></div><span class="status">Planlandı</span></div>`).join('')}</article><article class="panel"><div class="panel-heading"><h3>Son duyuru</h3></div><div class="progress-group"><strong>Hafta sonu hazırlık maçı</strong><span class="muted">U12 grubumuz cumartesi 10:30'da hazırlık maçında buluşuyor.</span><button class="secondary-button" data-page="notifications">Duyuruları aç</button></div></article></section>
  </div>`;
}

function studentsView() {
  const visibleStudents = filteredAndSortedStudents();
  return `<div class="page-stack"><div class="section-heading"><div><h2>Kayıtlı öğrenciler</h2><p><span id="studentsCountSummary">${visibleStudents.length} / ${state.students.length}</span> öğrenci gösteriliyor</p></div><button class="primary-button" data-action="add-student">+ Yeni öğrenci</button></div>
    <div class="toolbar"><input class="search-input" id="studentSearch" type="search" placeholder="Öğrenci veya veli ara"><select id="groupFilter"><option value="">Tüm gruplar</option>${GROUPS.map(group => `<option>${group}</option>`).join('')}</select></div>
    <label class="students-active-filter"><input id="activeStudentsOnlyFilter" type="checkbox" ${state.activeStudentsOnly ? 'checked' : ''}><span>Sadece aktif öğrenciler</span></label>
    <section class="panel table-wrap"><table><thead><tr>${studentSortHeader('name', 'Öğrenci')}${studentSortHeader('birth', 'Doğum tarihi')}${studentSortHeader('group', 'Grup / Mevki')}${studentSortHeader('parent', 'Veli')}${studentSortHeader('fee', 'Aidat')}${studentSortHeader('attendance', 'Devam')}<th></th></tr></thead><tbody id="studentsBody">${studentRows(visibleStudents)}</tbody></table></section></div>`;
}

function studentSortHeader(key, label) {
  const active = state.studentSortKey === key;
  const direction = active ? state.studentSortDirection : 'none';
  const indicator = active ? state.studentSortDirection === 'asc' ? '↑' : '↓' : '↕';
  return `<th aria-sort="${direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}"><button class="table-sort-button" type="button" data-action="student-sort" data-sort-key="${key}"><span>${label}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;
}
function studentSortValue(student, key) {
  if (key === 'fee') return { none: 'Aidat yok', late: 'Ödenmedi', paid: 'Ödendi', exempt: 'Muaf', unknown: 'Kaynak notu' }[currentFeeStatus(student)] || '';
  if (key === 'attendance') return Number(student.attendance) || 0;
  return key === 'group' ? `${student.group || ''} ${student.position || ''}` : student[key] || '';
}
function sortStudentList(list) {
  if (!state.studentSortKey) return list;
  const direction = state.studentSortDirection === 'desc' ? -1 : 1;
  return [...list].sort((left, right) => {
    const leftValue = studentSortValue(left, state.studentSortKey);
    const rightValue = studentSortValue(right, state.studentSortKey);
    return typeof leftValue === 'number' && typeof rightValue === 'number'
      ? (leftValue - rightValue) * direction
      : String(leftValue).localeCompare(String(rightValue), 'tr-TR', { numeric: true, sensitivity: 'base' }) * direction;
  });
}
function filteredAndSortedStudents() {
  const query = (document.querySelector('#studentSearch')?.value || '').toLocaleLowerCase('tr');
  const group = document.querySelector('#groupFilter')?.value || '';
  const filtered = state.students.filter(student => (!state.activeStudentsOnly || isActiveStudent(student)) && (!query || `${student.name} ${student.parent}`.toLocaleLowerCase('tr').includes(query)) && (!group || student.group === group));
  return sortStudentList(filtered);
}
function updateStudentsTable() {
  const filtered = filteredAndSortedStudents();
  const studentsBody = document.querySelector('#studentsBody');
  if (studentsBody) studentsBody.innerHTML = studentRows(filtered);
  const countSummary = document.querySelector('#studentsCountSummary');
  if (countSummary) countSummary.textContent = `${filtered.length} / ${state.students.length}`;
}
function updateStudentSortHeaders() {
  document.querySelectorAll('[data-action="student-sort"]').forEach(button => {
    const active = button.dataset.sortKey === state.studentSortKey;
    button.querySelector('.sort-indicator').textContent = active ? state.studentSortDirection === 'asc' ? '↑' : '↓' : '↕';
    button.closest('th')?.setAttribute('aria-sort', active ? state.studentSortDirection === 'asc' ? 'ascending' : 'descending' : 'none');
  });
}
function studentRows(list) { return list.map(s => `<tr><td><span class="profile-cell"><span class="profile-avatar">${initials(s.name)}</span>${studentNameLink(s)}</span></td><td>${s.birth}</td><td>${s.group}${s.position ? ` · ${s.position}` : ''}</td><td>${s.parent || '—'}<br><small class="muted">${s.phone}</small></td><td>${statusLabel(currentFeeStatus(s))}</td><td>%${s.attendance}</td><td><button class="text-button" data-action="profile" data-id="${s.id}">Profili aç</button></td></tr>`).join(''); }

function childView() {
  const s = state.students[0];
  const feeStatus = currentFeeStatus(s);
  const feeText = feeStatus === 'paid' ? 'Ödendi' : feeStatus === 'late' ? 'Ödenmedi' : feeStatus === 'none' ? 'Aidat yok' : 'Bekliyor';
  return `<div class="page-stack"><section class="panel parent-hero"><span class="profile-avatar">${initials(s.name)}</span><div><h2>${studentNameLink(s, true)}</h2><p>${s.birth} · ${s.group}${s.position ? ` · ${s.position}` : ''}</p></div><button class="secondary-button" data-action="profile" data-id="${s.id}">Tam profili aç</button></section><section class="stats-grid"><article class="stat-card"><span class="label">Katılım</span><strong>%${s.attendance}</strong><small>Henüz yoklama yok</small></article><article class="stat-card"><span class="label">Aidat</span><strong>${feeText}</strong><small>${formatFeeMonth(feeMonthKey())}</small></article><article class="stat-card"><span class="label">Antrenman grubu</span><strong>${s.group}</strong><small>Güncel grup</small></article><article class="stat-card"><span class="label">Mevki</span><strong>${s.position || 'Belirtilmedi'}</strong><small>Oyuncu profili</small></article></section><section class="panel"><div class="panel-heading"><h3>İletişim bilgileri</h3></div><div class="progress-group"><span><strong>Veli:</strong> ${s.parent || 'Bilgi girilmedi'}</span><span><strong>Telefon:</strong> ${s.phone}</span><span><strong>E-posta:</strong> ${s.email || 'Bilgi girilmedi'}</span></div></section></div>`;
}

function studentProfileView() {
  const allowedStudent = state.role === 'parent' ? state.students[0] : state.students.find(student => student.id === Number(state.selectedStudentId));
  const student = allowedStudent || state.students[0];
  if (!student) return `<div class="page-stack"><section class="panel empty-state"><h2>Öğrenci bulunamadı</h2><button class="secondary-button" data-page="${state.role === 'parent' ? 'dashboard' : 'students'}">Geri dön</button></section></div>`;
  const attendanceCount = attendanceEntriesForStudent(student).length;
  const currentFee = currentFeeStatus(student);
  const activeStudent = isActiveStudent(student);
  const unpaidFees = unpaidFeePeriods(student);
  const feeSummaryTitle = unpaidFees.length === 0 ? currentFee === 'none' ? 'Aidat yok' : 'Güncel' : unpaidFees.length > 1 ? `${unpaidFees.length} aidat ödenmedi` : 'Ödenmedi';
  const feeSummaryDetail = unpaidFees.length ? unpaidFees.map(formatFeeMonth).join(' · ') : currentFee === 'none' ? 'Bu dönem için aidat tanımlanmadı' : 'Borç bulunmuyor';
  return `<div class="page-stack">
    <div class="section-heading"><div><button class="back-button" type="button" data-page="${state.role === 'parent' ? 'child' : 'students'}">← Geri</button></div>${state.role !== 'parent' ? '<button class="secondary-button" data-action="edit-profile">Bilgileri düzenle</button>' : ''}</div>
    <section class="panel student-profile-hero"><span class="profile-avatar">${initials(student.name)}</span><div>${activeStudent ? '<span class="eyebrow">AKTİF ÖĞRENCİ</span>' : ''}<h2>${student.name}</h2><p>${student.birth} doğumlu · Grup: ${student.group}${student.position ? ` · ${student.position}` : ''}</p></div></section>
    <section class="stats-grid profile-stats-grid"><article class="stat-card"><span class="label">Devam oranı</span><strong>%${student.attendance}</strong><button class="stat-link" type="button" data-page="studentAttendanceHistory">${attendanceCount} kayıtlı yoklama</button></article><article class="stat-card"><span class="label">Aidat durumu</span><strong>${feeSummaryTitle}</strong><small>${feeSummaryDetail}</small></article><article class="stat-card"><span class="label">Yaş grubu</span><strong>${student.group}</strong><small>Aktif antrenman grubu</small></article><article class="stat-card"><span class="label">Mevki</span><strong>${student.position || 'Belirtilmedi'}</strong><small>Oyuncu profili</small></article></section>
    <section class="profile-details-grid"><article class="panel"><div class="panel-heading"><h3>Öğrenci bilgileri</h3></div><dl class="detail-list"><div><dt>Adı soyadı</dt><dd>${student.name}</dd></div><div><dt>Doğum tarihi</dt><dd>${student.birth}</dd></div><div><dt>Kayıt tarihi</dt><dd>${formatEnrollmentDate(student.enrollmentDate)}</dd></div><div><dt>Yaş grubu</dt><dd>${student.group}</dd></div><div><dt>Oynadığı mevki</dt><dd>${student.position || 'Bilgi girilmedi'}</dd></div></dl></article><article class="panel"><div class="panel-heading"><h3>Veli ve iletişim</h3></div><dl class="detail-list"><div><dt>Veli adı soyadı</dt><dd>${student.parent || 'Bilgi girilmedi'}</dd></div><div><dt>Telefon</dt><dd><a href="tel:${student.phone}">${student.phone}</a></dd></div><div><dt>E-posta</dt><dd>${student.email ? `<a href="mailto:${student.email}">${student.email}</a>` : 'Bilgi girilmedi'}</dd></div><div><dt>Kısa adres</dt><dd>${student.address || 'Adres bilgisi girilmemiş'}</dd></div></dl></article></section>
    <section class="panel"><div class="panel-heading"><div><h3>Aylık aidat takibi</h3><small class="muted">Kayıt tarihinden itibaren tüm dönemler</small></div><span class="status blue">${monthlyFeePeriods(student).length} dönem</span></div><div class="table-wrap"><table class="monthly-fee-table"><thead><tr><th>Dönem</th><th>Tutar</th><th>Son ödeme</th><th>Durum</th>${state.role !== 'parent' ? '<th>Ödeme</th>' : ''}</tr></thead><tbody>${monthlyFeeRows(student)}</tbody></table></div></section>
    <section class="panel"><div class="panel-heading"><h3>Yaklaşan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${state.trainings.filter(training => training.group === student.group).map(training => `<div class="list-row"><span class="time">${training.time}</span><div><strong>${training.title}</strong><small>${training.coach} · ${training.field}</small></div><span class="status">${training.group}</span></div>`).join('') || '<div class="empty-state">Bu grup için planlanmış antrenman bulunmuyor.</div>'}</section>
    ${studentTimelineMarkup(student)}
  </div>`;
}

function studentAttendanceHistoryView() {
  const allowedStudent = state.role === 'parent' ? state.students[0] : state.students.find(student => student.id === Number(state.selectedStudentId));
  const student = allowedStudent || state.students[0];
  if (!student) return `<div class="page-stack"><section class="panel empty-state"><h2>Öğrenci bulunamadı</h2><button class="secondary-button" data-page="dashboard">Geri dön</button></section></div>`;
  const entries = attendanceEntriesForStudent(student);
  const presentCount = entries.filter(entry => entry.present).length;
  const absentCount = entries.length - presentCount;
  return `<div class="page-stack"><div class="section-heading"><div><button class="back-button" type="button" data-page="studentProfile">← Öğrenci profiline dön</button><h2>${student.name} · Yoklama geçmişi</h2><p>Kayıtlı antrenman katılım sonuçları</p></div></div><section class="stats-grid"><article class="stat-card"><span class="label">Toplam yoklama</span><strong>${entries.length}</strong><small>Kayıtlı antrenman</small></article><article class="stat-card"><span class="label">Geldi</span><strong>${presentCount}</strong><small>Katıldığı antrenman</small></article><article class="stat-card"><span class="label">Gelmedi</span><strong>${absentCount}</strong><small>Katılmadığı antrenman</small></article></section><section class="panel table-wrap"><table><thead><tr><th>Tarih / Saat</th><th>Antrenman</th><th>Antrenör / Saha</th><th>Durum</th></tr></thead><tbody>${entries.map(entry => `<tr><td><strong>${formatTrainingDate(entry.training.date)}</strong><br><small class="muted">${entry.training.time}</small></td><td>${entry.training.title}<br><small class="muted">${entry.training.group}</small></td><td>${entry.training.coach}<br><small class="muted">${entry.training.field}</small></td><td><span class="status ${entry.present ? '' : 'danger'}">${entry.present ? 'Geldi' : 'Gelmedi'}</span></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state">Bu öğrenci için henüz kayıtlı yoklama bulunmuyor.</div></td></tr>'}</tbody></table></section></div>`;
}

function trainingsView() {
  const orderedTrainings = [...state.trainings].sort((a, b) => `${a.date || ''} ${a.time}`.localeCompare(`${b.date || ''} ${b.time}`));
  return `<div class="page-stack"><div class="section-heading"><div><h2>Antrenman takvimi</h2><p>Planlanan grup çalışmaları · ${state.trainings.length} kayıt</p></div>${state.role !== 'parent' ? '<button class="primary-button" data-action="new-training">+ Antrenman ekle</button>' : ''}</div><section class="card-grid">${orderedTrainings.map(t => `<article class="panel training-card"><header><div><span class="eyebrow">${t.group}</span><h3>${t.title}</h3></div><span class="training-schedule">${formatTrainingDate(t.date)} · ${t.time}</span></header><div class="training-duration"><span aria-hidden="true">⏱️</span><span>${t.duration || 90} dakika</span></div><div class="training-meta"><span>⚑ ${t.field}</span><span>● ${t.coach}</span>${latestAttendanceForTraining(t) ? `<span>◎ ${trainingAttendanceLabel(t)}</span>` : ''}</div><div class="training-actions">${state.role !== 'parent' ? `<button class="primary-button" data-action="attendance" data-id="${t.id}">Yoklama al</button>` : '<button class="primary-button" data-action="calendar-added">Takvime ekle</button>'}${state.role === 'admin' ? `<button class="secondary-button" type="button" data-action="edit-training" data-id="${t.id}">Düzenle</button>` : ''}</div></article>`).join('') || '<div class="panel empty-state">Henüz planlanmış antrenman bulunmuyor.</div>'}</section></div>`;
}

function attendanceView() {
  return `<div class="page-stack"><div class="section-heading"><div><h2>Yoklama merkezi</h2><p>Antrenman bazında katılım kaydı</p></div></div><section class="panel">${state.trainings.map(t => `<div class="list-row"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>${trainingAttendanceLabel(t)} · ${t.coach}</small></div><button class="primary-button" data-action="attendance" data-id="${t.id}">Yoklama al</button></div>`).join('')}</section></div>`;
}

function feesView() {
  const isParent = state.role === 'parent';
  const allStudents = isParent ? state.students.slice(0,1) : state.students;
  const pendingStudents = allStudents.filter(student => currentFeeStatus(student) === 'late');
  const list = state.feeFilter === 'pending' ? pendingStudents : allStudents;
  const currentMonth = feeMonthKey();
  const currentMonthLabel = formatFeeMonth(currentMonth);
  const [currentYear, currentMonthNumber] = currentMonth.split('-');
  const liableStudents = allStudents.filter(student => ['paid', 'late'].includes(currentFeeStatus(student)));
  const total = liableStudents.length * 1500;
  const collected = allStudents.filter(student => currentFeeStatus(student) === 'paid').length * 1500;
  const pending = pendingStudents.length * 1500;
  const title = state.feeFilter === 'pending' && !isParent ? 'Ödemesi yapılmamış öğrenciler' : isParent ? 'Aidat bilgilerim' : 'Aidat takip listesi';
  const headerAction = state.feeFilter === 'pending' && !isParent ? '<button class="secondary-button" data-action="fee-filter" data-filter="all">Tüm aidatları göster</button>' : !isParent ? '<button class="primary-button" data-action="collect-fee">+ Tahsilat gir</button>' : '';
  return `<div class="page-stack"><div class="section-heading"><div><h2>${title}</h2><p>${currentMonthLabel} ödeme dönemi · ${list.length} öğrenci</p></div>${headerAction}</div><section class="stats-grid"><article class="stat-card"><span class="label">Aylık tahakkuk</span><strong>${formatCurrency(total)}</strong><small>${currentMonthLabel}</small></article><article class="stat-card"><span class="label">Tahsil edilen</span><strong>${formatCurrency(collected)}</strong><small>${total ? `%${Math.round(collected / total * 100)} tahsilat` : '%0 tahsilat'}</small></article><article class="stat-card"><span class="label">Bekleyen</span><strong>${formatCurrency(pending)}</strong><small>${pendingStudents.length} öğrenci</small></article></section><section class="panel table-wrap"><table><thead><tr><th>Öğrenci</th><th>Dönem</th><th>Tutar</th><th>Son ödeme</th><th>Durum</th>${!isParent ? '<th></th>' : ''}</tr></thead><tbody>${list.map(s => { const status = currentFeeStatus(s); const paymentAction = status === 'none' ? statusLabel('none') : `<button class="text-button" data-action="mark-paid" data-id="${s.id}">${status === 'paid' ? 'Makbuz' : 'Ödendi işaretle'}</button>`; return `<tr><td>${studentNameLink(s)}</td><td>${currentMonthLabel}</td><td>${status === 'none' ? '—' : '₺1.500'}</td><td>05.${currentMonthNumber}.${currentYear}</td><td>${statusLabel(status)}</td>${!isParent ? `<td>${paymentAction}</td>` : ''}</tr>`; }).join('')}</tbody></table></section></div>`;
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
  return `<small class="payment-method-summary"><span>Nakit ${formatCurrency(totals.cash)}</span><span>Havale ${formatCurrency(totals.transfer)}</span><span>Kredi kartı ${formatCurrency(totals.card)}</span></small>`;
}

function accountingView() {
  const periodEntries = accountingPeriodEntries();
  const income = periodEntries.filter(entry => entry.kind === 'income').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expense = periodEntries.filter(entry => entry.kind === 'expense').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const incomeCount = periodEntries.filter(entry => entry.kind === 'income').length;
  const expenseCount = periodEntries.filter(entry => entry.kind === 'expense').length;
  const incomeMethods = paymentMethodTotals(periodEntries, 'income');
  const expenseMethods = paymentMethodTotals(periodEntries, 'expense');
  return `<div class="page-stack"><div class="section-heading"><div><h2>Muhasebe</h2><p>Yerel gelir ve gider kayıtları · ${accountingPeriodLabel()}</p></div><button class="primary-button" data-action="new-entry">+ Yeni işlem</button></div>${accountingPeriodFiltersMarkup()}<section class="stats-grid"><article class="stat-card"><span class="label">Toplam gelir</span><strong>${formatCurrency(income)}</strong><div class="stat-card-breakdown"><button class="stat-link" type="button" data-action="accounting-entries" data-kind="income">${incomeCount} kayıt</button>${paymentMethodSummary(incomeMethods)}</div></article><article class="stat-card"><span class="label">Toplam gider</span><strong>${formatCurrency(expense)}</strong><div class="stat-card-breakdown"><button class="stat-link" type="button" data-action="accounting-entries" data-kind="expense">${expenseCount} kayıt</button>${paymentMethodSummary(expenseMethods)}</div></article><article class="stat-card"><span class="label">Kasa</span><strong>${formatCurrency(income - expense)}</strong></article></section><section class="panel"><div class="panel-heading"><h3>Son işlemler</h3><button class="text-button" type="button" data-action="accounting-entries" data-kind="all">Tümünü gör</button></div>${accountingEntryRows(periodEntries.slice(0, 4))}</section></div>`;
}

function accountingEntryRows(entries) {
  return entries.map(entry => `<div class="ledger-entry" data-entry-id="${entry.id}"><div class="ledger-date"><strong>${formatAccountingDate(entry.date)}</strong><span class="entry-type ${entry.kind}">${entry.type}</span></div><div class="ledger-details"><strong>${entry.title}</strong></div><div class="ledger-amount"><span class="amount ${entry.kind}">${entry.kind === 'income' ? '+' : '-'}${formatCurrency(entry.amount)}</span><small class="muted payment-method-label">${PAYMENT_METHODS[entry.paymentMethod] || 'Nakit'}</small></div><button class="ledger-menu-button" type="button" data-action="toggle-entry-actions" aria-label="${entry.title} işlem menüsünü aç" aria-expanded="false">...</button><div class="ledger-actions"><button class="secondary-button" type="button" data-action="edit-entry" data-id="${entry.id}">Düzenle</button><button class="danger-button" type="button" data-action="delete-entry" data-id="${entry.id}">Sil</button></div></div>`).join('') || '<div class="empty-state">Henüz muhasebe işlemi bulunmuyor.</div>';
}

function accountingEntriesView() {
  const periodEntries = accountingPeriodEntries();
  const filteredEntries = state.accountingFilter === 'all' ? periodEntries : periodEntries.filter(entry => entry.kind === state.accountingFilter);
  const filterLabel = state.accountingFilter === 'income' ? 'Gelir işlemleri' : state.accountingFilter === 'expense' ? 'Gider işlemleri' : 'Tüm işlemler';
  return `<div class="page-stack"><div class="section-heading"><div><button class="back-button" type="button" data-page="accounting">← Muhasebeye dön</button><h2>${filterLabel}</h2><p>${filteredEntries.length} kayıt · ${accountingPeriodLabel()}</p></div><button class="primary-button" data-action="new-entry">+ Yeni işlem</button></div>${accountingPeriodFiltersMarkup()}<div class="toolbar accounting-filters"><button class="${state.accountingFilter === 'all' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="all">Tümü</button><button class="${state.accountingFilter === 'income' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="income">Gelir</button><button class="${state.accountingFilter === 'expense' ? 'primary-button' : 'secondary-button'}" type="button" data-action="accounting-entries" data-kind="expense">Gider</button></div><section class="panel">${accountingEntryRows(filteredEntries)}</section></div>`;
}

function notificationsView() {
  const canSend = state.role !== 'parent';
  return `<div class="page-stack"><div class="section-heading"><div><h2>Bildirim merkezi</h2><p>Bildirim taslakları şimdilik bu cihazda saklanır</p></div></div>${canSend ? `<section class="panel"><div class="panel-heading"><h3>Yeni bildirim oluştur</h3><span class="status blue">Yerel kayıt · Push pasif</span></div><form class="notification-compose" id="notificationForm"><label>Alıcı grubu<select name="audience" required><option>Tüm kullanıcılar</option><option>Tüm veliler</option>${GROUPS.map(group => `<option>${group} velileri</option>`).join('')}<option>Normal kullanıcılar</option></select></label><label>Başlık<input name="title" required placeholder="Örn. Antrenman saati değişikliği"></label><label>Mesaj<textarea name="message" rows="3" required placeholder="Bildirim metnini yazın"></textarea></label><div class="compose-actions"><button class="primary-button" type="submit">Yerel bildirimi kaydet</button></div></form></section>` : ''}<section class="panel"><div class="panel-heading"><h3>Son bildirimler</h3><span class="status">${state.notifications.length} kayıt</span></div>${state.notifications.map(item => `<div class="list-row"><span class="time">${item.date}</span><div><strong>${item.title}</strong><small>${item.audience} · ${item.time}</small></div><span class="status">${item.status}</span></div>`).join('')}</section></div>`;
}

const views = { dashboard: dashboardView, students: studentsView, studentProfile: studentProfileView, studentAttendanceHistory: studentAttendanceHistoryView, child: childView, trainings: trainingsView, attendance: attendanceView, fees: feesView, accounting: accountingView, accountingEntries: accountingEntriesView, notifications: notificationsView };

function render() {
  if (!navItems[state.page]?.roles.includes(state.role)) state.page = 'dashboard';
  renderNavigation();
  const [title, subtitle] = pageMeta[state.page];
  document.querySelector('#pageTitle').textContent = title;
  document.querySelector('#pageSubtitle').textContent = subtitle;
  document.querySelector('#sidebarRole').textContent = roleNames[state.role];
  document.querySelector('#sidebarUser').textContent = state.role === 'parent' ? 'Ayşe Arslan' : state.role === 'staff' ? 'Oğuz Yalçın' : 'Hasan Sargın';
  roleSwitcher.value = state.role;
  appContent.innerHTML = views[state.page]();
  appContent.focus({ preventScroll: true });
}

function login(role = 'admin') { state.role = role; state.page = 'dashboard'; authScreen.classList.add('is-hidden'); appShell.classList.remove('is-hidden'); render(); }
function logout() { appShell.classList.add('is-hidden'); authScreen.classList.remove('is-hidden'); document.querySelector('#loginForm input').focus(); }
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600); }

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
  document.querySelector('#studentDialog').showModal();
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
  form.elements.coach.value = training?.coach || (state.role === 'staff' ? 'Oğuz Yalçın' : '');
  form.elements.field.value = training?.field || '';
  document.querySelector('#trainingEyebrow').textContent = training ? 'ANTRENMANI DÜZENLE' : 'YENİ ANTRENMAN';
  document.querySelector('#trainingDialogTitle').textContent = training ? 'Antrenman bilgilerini güncelle' : 'Antrenman planla';
  document.querySelector('#trainingSubmitButton').textContent = training ? 'Değişiklikleri kaydet' : 'Antrenmanı kaydet';
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

document.querySelector('#loginForm').addEventListener('submit', event => { event.preventDefault(); login('admin'); });
document.querySelectorAll('[data-demo-role]').forEach(button => button.addEventListener('click', () => login(button.dataset.demoRole)));
document.querySelector('#logoutButton').addEventListener('click', logout);
document.querySelector('#menuButton').addEventListener('click', () => document.querySelector('#sidebar').classList.add('open'));
document.querySelector('#sidebarScrim').addEventListener('click', () => document.querySelector('#sidebar').classList.remove('open'));
roleSwitcher.addEventListener('change', () => { state.role = roleSwitcher.value; state.page = 'dashboard'; render(); });

document.addEventListener('click', event => {
  const dialogCloseButton = event.target.closest('[data-dialog-close]');
  if (dialogCloseButton) { const dialog = document.querySelector(`#${dialogCloseButton.dataset.dialogClose}`); if (dialog?.open) dialog.close(); dialog?.querySelector('form')?.reset(); if (dialog?.id === 'studentDialog') state.editingStudentId = null; if (dialog?.id === 'trainingDialog') state.editingTrainingId = null; if (dialog?.id === 'accountingDialog') state.editingAccountingEntryId = null; return; }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton && appShell.contains(pageButton)) { state.page = pageButton.dataset.page; if (state.page === 'fees') state.feeFilter = 'all'; document.querySelector('#sidebar').classList.remove('open'); render(); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) {
    closeLedgerActions();
    return;
  }
  const action = actionButton.dataset.action;
  if (action === 'add-student') openStudentDialog();
  else if (action === 'edit-profile' && state.role !== 'parent') { const student = state.students.find(item => item.id === Number(state.selectedStudentId)); if (student) openStudentDialog(student); }
  else if (action === 'new-training') openTrainingDialog();
  else if (action === 'edit-training' && state.role === 'admin') { const training = state.trainings.find(item => item.id === Number(actionButton.dataset.id)); if (training) openTrainingDialog(training); }
  else if (action === 'new-entry') openAccountingDialog();
  else if (action === 'accounting-period') { state.accountingPeriod = actionButton.dataset.period; window.localStorage.setItem('sporx_accounting_period', state.accountingPeriod); render(); }
  else if (action === 'accounting-entries') { state.accountingFilter = actionButton.dataset.kind || 'all'; state.page = 'accountingEntries'; render(); }
  else if (action === 'pending-fees') { state.feeFilter = 'pending'; state.page = 'fees'; render(); }
  else if (action === 'fee-filter') { state.feeFilter = actionButton.dataset.filter || 'all'; render(); }
  else if (action === 'student-sort') { const key = actionButton.dataset.sortKey; if (state.studentSortKey === key) state.studentSortDirection = state.studentSortDirection === 'asc' ? 'desc' : 'asc'; else { state.studentSortKey = key; state.studentSortDirection = 'asc'; } updateStudentsTable(); updateStudentSortHeaders(); }
  else if (action === 'toggle-entry-actions') toggleLedgerActions(actionButton.closest('.ledger-entry'));
  else if (action === 'edit-entry') { const entry = state.accountingEntries.find(item => item.id === Number(actionButton.dataset.id)); closeLedgerActions(); if (entry) openAccountingDialog(entry); }
  else if (action === 'delete-entry') { const entry = state.accountingEntries.find(item => item.id === Number(actionButton.dataset.id)); if (entry && window.confirm(`“${entry.title}” işlemi silinsin mi?`)) { state.accountingEntries = state.accountingEntries.filter(item => item.id !== entry.id); persistLocalData(); render(); showToast('Muhasebe işlemi silindi.'); } }
  else if (action === 'attendance') openAttendance(actionButton.dataset.id);
  else if (action === 'mark-paid') { const student = state.students.find(s => s.id === Number(actionButton.dataset.id)); if (student) { setMonthlyFeeStatus(student, feeMonthKey(), 'paid'); persistLocalData(); render(); showToast('Aidat ödendi; tahsilat muhasebeye gelir olarak eklendi.'); } }
  else if (action === 'profile') { state.selectedStudentId = Number(actionButton.dataset.id); state.page = 'studentProfile'; const studentDialog = document.querySelector('#studentDialog'); const attendanceDialog = document.querySelector('#attendanceDialog'); if (studentDialog.open) studentDialog.close(); if (attendanceDialog.open) attendanceDialog.close(); render(); }
  else if (action === 'calendar-added') showToast('Antrenman takvime eklendi.');
  else showToast('Bu işlem sonraki geliştirme adımında açılacak.');
});

appContent.addEventListener('input', event => {
  if (!['studentSearch', 'groupFilter', 'activeStudentsOnlyFilter'].includes(event.target.id)) return;
  if (event.target.id === 'activeStudentsOnlyFilter') state.activeStudentsOnly = event.target.checked;
  updateStudentsTable();
});

appContent.addEventListener('change', event => {
  const statusControl = event.target.closest('[data-monthly-fee-status]');
  if (statusControl && state.role !== 'parent') {
    const student = state.students.find(item => item.id === Number(statusControl.dataset.id));
    if (!student) return;
    setMonthlyFeeStatus(student, statusControl.dataset.month, statusControl.value);
    persistLocalData();
    render();
    showToast(statusControl.value === 'late' ? 'Aidat borç bakiyesine eklendi.' : 'Bu dönem için aidat kaldırıldı.');
    return;
  }
  const paymentControl = event.target.closest('[data-monthly-fee]');
  if (!paymentControl || state.role === 'parent') return;
  const student = state.students.find(item => item.id === Number(paymentControl.dataset.id));
  if (!student) return;
  const status = paymentControl.checked ? 'paid' : 'late';
  setMonthlyFeeStatus(student, paymentControl.dataset.month, status);
  persistLocalData();
  render();
  showToast(paymentControl.checked ? 'Aidat ödendi; tahsilat muhasebeye gelir olarak eklendi.' : 'Ödeme kaldırıldı; aidat borç bakiyesine geri eklendi.');
});

document.querySelector('#studentForm').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const studentData = { name: data.get('studentName').trim(), birth: formatStudentBirthDate(data.get('birthDate')), group: data.get('group'), position: data.get('position'), parent: data.get('parentName').trim(), phone: data.get('phone').trim(), email: data.get('email').trim(), address: data.get('address').trim() };
  const wasEditing = Boolean(state.editingStudentId);
  if (wasEditing) {
    const student = state.students.find(item => item.id === Number(state.editingStudentId));
    if (student) Object.assign(student, studentData);
  } else {
    const enrollmentDate = localDateValue();
    state.students.unshift({ id: Date.now(), ...studentData, enrollmentDate, feePayments: { [feeMonthKey()]: 'none' }, fee: 'none', attendance: 100 });
  }
  state.editingStudentId = null;
  persistLocalData();
  document.querySelector('#studentDialog').close();
  event.currentTarget.reset();
  state.page = wasEditing ? 'studentProfile' : 'students';
  render();
  showToast(wasEditing ? 'Öğrenci profili güncellendi.' : 'Öğrenci yerel veritabanına kaydedildi.');
});
document.querySelector('#attendanceForm').addEventListener('submit', event => {
  event.preventDefault();
  const presentStudentIds = [...document.querySelectorAll('#attendanceList [data-student-id]:checked')].map(input => Number(input.dataset.studentId));
  state.attendanceRecords.unshift({ id: Date.now(), trainingId: state.activeTrainingId, date: new Date().toISOString(), presentStudentIds });
  persistLocalData();
  document.querySelector('#attendanceDialog').close();
  render();
  showToast('Yoklama yerel veritabanına kaydedildi.');
});
document.querySelector('#trainingForm').addEventListener('submit', event => {
  event.preventDefault();
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
  if (wasEditing) {
    const training = state.trainings.find(item => item.id === Number(state.editingTrainingId));
    if (training) Object.assign(training, trainingData);
  } else {
    state.trainings.push({ id: Date.now(), ...trainingData });
  }
  state.editingTrainingId = null;
  persistLocalData();
  document.querySelector('#trainingDialog').close();
  event.currentTarget.reset();
  state.page = 'trainings';
  render();
  showToast(wasEditing ? 'Antrenman bilgileri güncellendi.' : 'Antrenman yerel veritabanına kaydedildi.');
});
document.querySelector('#accountingForm').addEventListener('submit', event => {
  event.preventDefault();
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
  if (state.editingAccountingEntryId) {
    const entry = state.accountingEntries.find(item => item.id === Number(state.editingAccountingEntryId));
    if (entry) Object.assign(entry, entryData);
  } else {
    state.accountingEntries.unshift({ id: Date.now(), ...entryData });
  }
  const wasEditing = Boolean(state.editingAccountingEntryId);
  state.editingAccountingEntryId = null;
  persistLocalData();
  document.querySelector('#accountingDialog').close();
  event.currentTarget.reset();
  if (state.page !== 'accountingEntries') state.page = 'accounting';
  render();
  showToast(wasEditing ? 'Muhasebe işlemi güncellendi.' : 'Muhasebe işlemi yerel veritabanına kaydedildi.');
});
appContent.addEventListener('submit', event => {
  if (event.target.id !== 'notificationForm') return;
  event.preventDefault();
  const data = new FormData(event.target);
  state.notifications.unshift({ id: Date.now(), date: 'Bugün', title: data.get('title'), body: data.get('message'), audience: data.get('audience'), time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), status: 'Yerel taslak' });
  persistLocalData();
  event.target.reset();
  render();
  showToast('Bildirim yerel veritabanına kaydedildi.');
});
