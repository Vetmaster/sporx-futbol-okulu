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
  selectedStudentId: null
};

const GROUPS = ['Saat 09:00', 'Saat 10:00', 'Saat 11:00', 'Saat 12:00', 'U11', 'U12', 'U13', 'U14'];

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
  child: { label: 'Çocuğum', icon: '◎', roles: ['parent'] },
  trainings: { label: 'Antrenman', icon: '▦', roles: ['admin', 'staff', 'parent'] },
  attendance: { label: 'Yoklama', icon: '✓', roles: ['admin', 'staff'] },
  fees: { label: 'Aidat', icon: '₺', roles: ['admin', 'staff', 'parent'] },
  accounting: { label: 'Muhasebe', icon: '↗', roles: ['admin'] },
  notifications: { label: 'Bildirimler', icon: '●', roles: ['admin', 'staff', 'parent'] }
};

const roleNames = { admin: 'Admin', staff: 'Normal kullanıcı', parent: 'Öğrenci velisi' };
const pageMeta = {
  dashboard: ['Genel Bakış', 'Kulübün bugünkü durumu'], students: ['Öğrenciler', 'Kayıtlar ve öğrenci profilleri'], studentProfile: ['Öğrenci Profili', 'Öğrenci ve veli bilgilerinin tamamı'], child: ['Çocuğum', 'Öğrenci profili ve güncel durum'],
  trainings: ['Antrenman', 'Antrenman takvimi ve gruplar'], attendance: ['Yoklama', 'Antrenman katılım takibi'], fees: ['Aidat', 'Aylık ödeme ve tahsilat takibi'],
  accounting: ['Muhasebe', 'Temel gelir ve gider takibi'], notifications: ['Bildirimler', 'Duyurular ve gönderim merkezi']
};

const appShell = document.querySelector('#appShell');
const authScreen = document.querySelector('#authScreen');
const appContent = document.querySelector('#appContent');
const mainNav = document.querySelector('#mainNav');
const bottomNav = document.querySelector('#bottomNav');
const roleSwitcher = document.querySelector('#roleSwitcher');

function allowedItems() { return Object.entries(navItems).filter(([, item]) => item.roles.includes(state.role) && !item.hidden); }
function initials(name) { return name.split(' ').map(part => part[0]).slice(0, 2).join(''); }
function statusLabel(fee) { return fee === 'paid' ? '<span class="status">Ödendi</span>' : fee === 'late' ? '<span class="status danger">Gecikti</span>' : '<span class="status warning">Bekliyor</span>'; }
function formatCurrency(value) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value); }
function localDateValue(date = new Date()) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); }
function formatTrainingDate(value) { return value ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(`${value}T00:00:00`)) : 'Tarih belirtilmedi'; }
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
  return `<div class="page-stack">
    <div class="section-heading"><div><h2>Bugünün kulüp özeti</h2><p>20 Temmuz Pazartesi · Son güncelleme şimdi</p></div><button class="primary-button" data-action="add-student">+ Yeni öğrenci</button></div>
    <section class="stats-grid">
      <article class="stat-card"><span class="label">Aktif öğrenci</span><strong>${state.students.length + 179}</strong><small>${GROUPS.length} grup</small></article>
      <article class="stat-card"><span class="label">Planlanan antrenman</span><strong>${state.trainings.length}</strong><small>Takvimde kayıtlı</small></article>
      <article class="stat-card"><span class="label">Bekleyen aidat</span><strong>₺28.400</strong><small>23 öğrenci</small></article>
      <article class="stat-card"><span class="label">Aylık net durum</span><strong>₺208.300</strong><small>+%8 geçen aya göre</small></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-heading"><h3>Planlanan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${state.trainings.map(t => `<div class="list-row"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>${t.coach} · ${t.field}</small></div><span class="status">${t.count} öğrenci</span></div>`).join('')}</article>
      <article class="panel"><div class="panel-heading"><h3>Kulüp performansı</h3><span class="status blue">Temmuz</span></div><div class="progress-group">
        ${progress('Aidat tahsilatı', 86)}${progress('Antrenman katılımı', 91)}${progress('Kontenjan kullanımı', 78)}
      </div></article>
    </section>
    <section class="panel"><div class="panel-heading"><h3>İşlem bekleyen aidatlar</h3><button class="text-button" data-page="fees">Tümünü gör</button></div>${state.students.filter(s => s.fee !== 'paid').map(s => `<div class="list-row"><span class="profile-avatar">${initials(s.name)}</span><div>${studentNameLink(s)}<small>${s.group} · Veli: ${s.parent}</small></div>${statusLabel(s.fee)}</div>`).join('')}</section>
  </div>`;
}

function progress(label, value) { return `<div><div class="progress-label"><span>${label}</span><strong>%${value}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${value}%"></div></div></div>`; }

function parentDashboard() {
  const student = state.students[0];
  return `<div class="page-stack">
    <section class="panel parent-hero"><span class="profile-avatar">${initials(student.name)}</span><div><h2>Merhaba, Ayşe Hanım</h2><p>${studentNameLink(student, true)} · ${student.group} · ${student.position}</p></div><button class="secondary-button" data-action="profile" data-id="${student.id}">Profili görüntüle</button></section>
    <section class="stats-grid">
      <article class="stat-card"><span class="label">Sıradaki antrenman</span><strong>Salı 18:00</strong><small>Ana saha</small></article>
      <article class="stat-card"><span class="label">Temmuz aidatı</span><strong>Ödendi</strong><small>Sonraki ödeme 1 Ağustos</small></article>
      <article class="stat-card"><span class="label">Katılım oranı</span><strong>%${student.attendance}</strong><small>Son 30 gün</small></article>
      <article class="stat-card"><span class="label">Yeni duyuru</span><strong>2</strong><small>Okunmayı bekliyor</small></article>
    </section>
    <section class="dashboard-grid"><article class="panel"><div class="panel-heading"><h3>Yaklaşan program</h3><button class="text-button" data-page="trainings">Takvim</button></div>${state.trainings.slice(0,2).map(t => `<div class="list-row"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>Salı · ${t.field}</small></div><span class="status">Planlandı</span></div>`).join('')}</article><article class="panel"><div class="panel-heading"><h3>Son duyuru</h3></div><div class="progress-group"><strong>Hafta sonu hazırlık maçı</strong><span class="muted">U12 grubumuz cumartesi 10:30'da hazırlık maçında buluşuyor.</span><button class="secondary-button" data-page="notifications">Duyuruları aç</button></div></article></section>
  </div>`;
}

function studentsView() {
  return `<div class="page-stack"><div class="section-heading"><div><h2>Kayıtlı öğrenciler</h2><p>${state.students.length} örnek kayıt görüntüleniyor</p></div><button class="primary-button" data-action="add-student">+ Yeni öğrenci</button></div>
    <div class="toolbar"><input class="search-input" id="studentSearch" type="search" placeholder="Öğrenci veya veli ara"><select id="groupFilter"><option value="">Tüm gruplar</option>${GROUPS.map(group => `<option>${group}</option>`).join('')}</select></div>
    <section class="panel table-wrap"><table><thead><tr><th>Öğrenci</th><th>Doğum tarihi</th><th>Grup / Mevki</th><th>Veli</th><th>Aidat</th><th>Devam</th><th></th></tr></thead><tbody id="studentsBody">${studentRows(state.students)}</tbody></table></section></div>`;
}

function studentRows(list) { return list.map(s => `<tr><td><span class="profile-cell"><span class="profile-avatar">${initials(s.name)}</span>${studentNameLink(s)}</span></td><td>${s.birth}</td><td>${s.group} · ${s.position}</td><td>${s.parent}<br><small class="muted">${s.phone}</small></td><td>${statusLabel(s.fee)}</td><td>%${s.attendance}</td><td><button class="text-button" data-action="profile" data-id="${s.id}">Profili aç</button></td></tr>`).join(''); }

function childView() {
  const s = state.students[0];
  return `<div class="page-stack"><section class="panel parent-hero"><span class="profile-avatar">${initials(s.name)}</span><div><h2>${studentNameLink(s, true)}</h2><p>${s.birth} · ${s.group} · ${s.position}</p></div><button class="secondary-button" data-action="profile" data-id="${s.id}">Tam profili aç</button></section><section class="stats-grid"><article class="stat-card"><span class="label">Katılım</span><strong>%${s.attendance}</strong><small>Çok iyi</small></article><article class="stat-card"><span class="label">Aidat</span><strong>Güncel</strong><small>Temmuz ödendi</small></article><article class="stat-card"><span class="label">Antrenman grubu</span><strong>${s.group}</strong><small>Salı · Perşembe</small></article><article class="stat-card"><span class="label">Mevki</span><strong>${s.position}</strong><small>Gelişim profili</small></article></section><section class="panel"><div class="panel-heading"><h3>İletişim bilgileri</h3></div><div class="progress-group"><span><strong>Veli:</strong> ${s.parent}</span><span><strong>Telefon:</strong> ${s.phone}</span><span><strong>E-posta:</strong> ${s.email}</span></div></section></div>`;
}

function studentProfileView() {
  const allowedStudent = state.role === 'parent' ? state.students[0] : state.students.find(student => student.id === Number(state.selectedStudentId));
  const student = allowedStudent || state.students[0];
  if (!student) return `<div class="page-stack"><section class="panel empty-state"><h2>Öğrenci bulunamadı</h2><button class="secondary-button" data-page="${state.role === 'parent' ? 'dashboard' : 'students'}">Geri dön</button></section></div>`;
  const attendanceCount = state.attendanceRecords.filter(record => record.presentStudentIds.includes(student.id)).length;
  return `<div class="page-stack">
    <div class="section-heading"><div><button class="back-button" type="button" data-page="${state.role === 'parent' ? 'child' : 'students'}">← Geri</button></div>${state.role !== 'parent' ? '<button class="secondary-button" data-action="edit-profile">Bilgileri düzenle</button>' : ''}</div>
    <section class="panel student-profile-hero"><span class="profile-avatar">${initials(student.name)}</span><div><span class="eyebrow">AKTİF ÖĞRENCİ</span><h2>${student.name}</h2><p>${student.birth} · ${student.group} · ${student.position}</p></div>${statusLabel(student.fee)}</section>
    <section class="stats-grid"><article class="stat-card"><span class="label">Devam oranı</span><strong>%${student.attendance}</strong><small>${attendanceCount} kayıtlı yoklama</small></article><article class="stat-card"><span class="label">Aidat durumu</span><strong>${student.fee === 'paid' ? 'Güncel' : student.fee === 'late' ? 'Gecikmiş' : 'Bekliyor'}</strong><small>Temmuz 2026</small></article><article class="stat-card"><span class="label">Yaş grubu</span><strong>${student.group}</strong><small>Aktif antrenman grubu</small></article><article class="stat-card"><span class="label">Mevki</span><strong>${student.position}</strong><small>Oyuncu profili</small></article></section>
    <section class="profile-details-grid"><article class="panel"><div class="panel-heading"><h3>Öğrenci bilgileri</h3></div><dl class="detail-list"><div><dt>Adı soyadı</dt><dd>${student.name}</dd></div><div><dt>Doğum tarihi</dt><dd>${student.birth}</dd></div><div><dt>Yaş grubu</dt><dd>${student.group}</dd></div><div><dt>Oynadığı mevki</dt><dd>${student.position}</dd></div></dl></article><article class="panel"><div class="panel-heading"><h3>Veli ve iletişim</h3></div><dl class="detail-list"><div><dt>Veli adı soyadı</dt><dd>${student.parent}</dd></div><div><dt>Telefon</dt><dd><a href="tel:${student.phone}">${student.phone}</a></dd></div><div><dt>E-posta</dt><dd><a href="mailto:${student.email}">${student.email}</a></dd></div><div><dt>Kısa adres</dt><dd>${student.address || 'Adres bilgisi girilmemiş'}</dd></div></dl></article></section>
    <section class="panel"><div class="panel-heading"><h3>Yaklaşan antrenmanlar</h3><button class="text-button" data-page="trainings">Tüm takvim</button></div>${state.trainings.filter(training => training.group === student.group).map(training => `<div class="list-row"><span class="time">${training.time}</span><div><strong>${training.title}</strong><small>${training.coach} · ${training.field}</small></div><span class="status">${training.group}</span></div>`).join('') || '<div class="empty-state">Bu grup için planlanmış antrenman bulunmuyor.</div>'}</section>
  </div>`;
}

function trainingsView() {
  const orderedTrainings = [...state.trainings].sort((a, b) => `${a.date || ''} ${a.time}`.localeCompare(`${b.date || ''} ${b.time}`));
  return `<div class="page-stack"><div class="section-heading"><div><h2>Antrenman takvimi</h2><p>Planlanan grup çalışmaları · ${state.trainings.length} kayıt</p></div>${state.role !== 'parent' ? '<button class="primary-button" data-action="new-training">+ Antrenman ekle</button>' : ''}</div><section class="card-grid">${orderedTrainings.map(t => `<article class="panel training-card"><header><div><span class="eyebrow">${t.group}</span><h3>${t.title}</h3></div><span class="status">${t.time}</span></header><div class="training-date">${formatTrainingDate(t.date)} · ${t.duration || 90} dakika</div><div class="training-meta"><span>⚑ ${t.field}</span><span>● ${t.coach}</span><span>◎ ${t.count} öğrenci</span></div><div class="training-actions">${state.role !== 'parent' ? `<button class="primary-button" data-action="attendance" data-id="${t.id}">Yoklama al</button>` : '<button class="primary-button" data-action="calendar-added">Takvime ekle</button>'}<button class="secondary-button">Detay</button></div></article>`).join('') || '<div class="panel empty-state">Henüz planlanmış antrenman bulunmuyor.</div>'}</section></div>`;
}

function attendanceView() {
  return `<div class="page-stack"><div class="section-heading"><div><h2>Yoklama merkezi</h2><p>Antrenman bazında katılım kaydı</p></div></div><section class="panel">${state.trainings.map(t => `<div class="list-row"><span class="time">${t.time}</span><div><strong>${t.group} · ${t.title}</strong><small>${t.count} öğrenci · ${t.coach}</small></div><button class="primary-button" data-action="attendance" data-id="${t.id}">Yoklama al</button></div>`).join('')}</section></div>`;
}

function feesView() {
  const isParent = state.role === 'parent';
  const list = isParent ? state.students.slice(0,1) : state.students;
  const total = list.length * 1500;
  const collected = list.filter(student => student.fee === 'paid').length * 1500;
  const pending = total - collected;
  return `<div class="page-stack"><div class="section-heading"><div><h2>${isParent ? 'Aidat bilgilerim' : 'Aidat takip listesi'}</h2><p>Temmuz 2026 ödeme dönemi · Yerel kayıt</p></div>${!isParent ? '<button class="primary-button" data-action="collect-fee">+ Tahsilat gir</button>' : ''}</div><section class="stats-grid"><article class="stat-card"><span class="label">Aylık tahakkuk</span><strong>${formatCurrency(total)}</strong><small>Temmuz 2026</small></article><article class="stat-card"><span class="label">Tahsil edilen</span><strong>${formatCurrency(collected)}</strong><small>${total ? `%${Math.round(collected / total * 100)} tahsilat` : '%0 tahsilat'}</small></article><article class="stat-card"><span class="label">Bekleyen</span><strong>${formatCurrency(pending)}</strong><small>${list.filter(s => s.fee !== 'paid').length} öğrenci</small></article></section><section class="panel table-wrap"><table><thead><tr><th>Öğrenci</th><th>Dönem</th><th>Tutar</th><th>Son ödeme</th><th>Durum</th>${!isParent ? '<th></th>' : ''}</tr></thead><tbody>${list.map(s => `<tr><td>${studentNameLink(s)}</td><td>Temmuz 2026</td><td>₺1.500</td><td>05.07.2026</td><td>${statusLabel(s.fee)}</td>${!isParent ? `<td><button class="text-button" data-action="mark-paid" data-id="${s.id}">${s.fee === 'paid' ? 'Makbuz' : 'Ödendi işaretle'}</button></td>` : ''}</tr>`).join('')}</tbody></table></section></div>`;
}

function accountingView() {
  const income = state.accountingEntries.filter(entry => entry.kind === 'income').reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expense = state.accountingEntries.filter(entry => entry.kind === 'expense').reduce((sum, entry) => sum + Number(entry.amount), 0);
  return `<div class="page-stack"><div class="section-heading"><div><h2>Temel muhasebe</h2><p>Yerel gelir ve gider kayıtları</p></div><button class="primary-button" data-action="new-entry">+ Yeni işlem</button></div><section class="stats-grid"><article class="stat-card"><span class="label">Toplam gelir</span><strong>${formatCurrency(income)}</strong><small>${state.accountingEntries.filter(e => e.kind === 'income').length} kayıt</small></article><article class="stat-card"><span class="label">Toplam gider</span><strong>${formatCurrency(expense)}</strong><small>${state.accountingEntries.filter(e => e.kind === 'expense').length} kayıt</small></article><article class="stat-card"><span class="label">Net durum</span><strong>${formatCurrency(income - expense)}</strong><small>${income - expense >= 0 ? 'Pozitif bakiye' : 'Negatif bakiye'}</small></article></section><section class="panel"><div class="panel-heading"><h3>Son işlemler</h3><span class="status blue">Bu cihazda</span></div>${state.accountingEntries.map(e => `<div class="ledger-entry"><strong>${e.date}</strong><div><strong>${e.title}</strong><small class="muted">${e.type}</small></div><span class="amount ${e.kind}">${e.kind === 'income' ? '+' : '-'}${formatCurrency(e.amount)}</span></div>`).join('')}</section></div>`;
}

function notificationsView() {
  const canSend = state.role !== 'parent';
  return `<div class="page-stack"><div class="section-heading"><div><h2>Bildirim merkezi</h2><p>Bildirim taslakları şimdilik bu cihazda saklanır</p></div></div>${canSend ? `<section class="panel"><div class="panel-heading"><h3>Yeni bildirim oluştur</h3><span class="status blue">Yerel kayıt · Push pasif</span></div><form class="notification-compose" id="notificationForm"><label>Alıcı grubu<select name="audience" required><option>Tüm kullanıcılar</option><option>Tüm veliler</option>${GROUPS.map(group => `<option>${group} velileri</option>`).join('')}<option>Normal kullanıcılar</option></select></label><label>Başlık<input name="title" required placeholder="Örn. Antrenman saati değişikliği"></label><label>Mesaj<textarea name="message" rows="3" required placeholder="Bildirim metnini yazın"></textarea></label><div class="compose-actions"><button class="primary-button" type="submit">Yerel bildirimi kaydet</button></div></form></section>` : ''}<section class="panel"><div class="panel-heading"><h3>Son bildirimler</h3><span class="status">${state.notifications.length} kayıt</span></div>${state.notifications.map(item => `<div class="list-row"><span class="time">${item.date}</span><div><strong>${item.title}</strong><small>${item.audience} · ${item.time}</small></div><span class="status">${item.status}</span></div>`).join('')}</section></div>`;
}

const views = { dashboard: dashboardView, students: studentsView, studentProfile: studentProfileView, child: childView, trainings: trainingsView, attendance: attendanceView, fees: feesView, accounting: accountingView, notifications: notificationsView };

function render() {
  if (!navItems[state.page]?.roles.includes(state.role)) state.page = 'dashboard';
  renderNavigation();
  const [title, subtitle] = pageMeta[state.page];
  document.querySelector('#pageTitle').textContent = title;
  document.querySelector('#pageSubtitle').textContent = subtitle;
  document.querySelector('#sidebarRole').textContent = roleNames[state.role];
  document.querySelector('#sidebarUser').textContent = state.role === 'parent' ? 'Ayşe Arslan' : state.role === 'staff' ? 'Oğuz Yalçın' : 'Hasan Sargın';
  document.querySelector('#notificationCount').textContent = Math.min(state.notifications.length, 9);
  roleSwitcher.value = state.role;
  appContent.innerHTML = views[state.page]();
  appContent.focus({ preventScroll: true });
}

function login(role = 'admin') { state.role = role; state.page = 'dashboard'; authScreen.classList.add('is-hidden'); appShell.classList.remove('is-hidden'); render(); }
function logout() { appShell.classList.add('is-hidden'); authScreen.classList.remove('is-hidden'); document.querySelector('#loginForm input').focus(); }
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600); }

function openAttendance(id) {
  const training = state.trainings.find(item => item.id === Number(id));
  state.activeTrainingId = training.id;
  document.querySelector('#attendanceTitle').textContent = `${training.group} · ${training.title}`;
  document.querySelector('#attendanceList').innerHTML = state.students.map(s => `<div class="attendance-item"><input id="attendance-${s.id}" type="checkbox" data-student-id="${s.id}" aria-label="${s.name} antrenmana katıldı" checked><span>${studentNameLink(s)} <small class="muted">· ${s.group}</small></span></div>`).join('');
  document.querySelector('#attendanceDialog').showModal();
}

function openTrainingDialog() {
  const form = document.querySelector('#trainingForm');
  form.reset();
  form.elements.date.value = localDateValue();
  form.elements.time.value = '09:00';
  form.elements.coach.value = state.role === 'staff' ? 'Oğuz Yalçın' : '';
  document.querySelector('#trainingDialog').showModal();
}

document.querySelector('#loginForm').addEventListener('submit', event => { event.preventDefault(); login('admin'); });
document.querySelectorAll('[data-demo-role]').forEach(button => button.addEventListener('click', () => login(button.dataset.demoRole)));
document.querySelector('#logoutButton').addEventListener('click', logout);
document.querySelector('#menuButton').addEventListener('click', () => document.querySelector('#sidebar').classList.add('open'));
document.querySelector('#sidebarScrim').addEventListener('click', () => document.querySelector('#sidebar').classList.remove('open'));
roleSwitcher.addEventListener('change', () => { state.role = roleSwitcher.value; state.page = 'dashboard'; render(); });

document.addEventListener('click', event => {
  const dialogCloseButton = event.target.closest('[data-dialog-close]');
  if (dialogCloseButton) { const dialog = document.querySelector(`#${dialogCloseButton.dataset.dialogClose}`); if (dialog?.open) dialog.close(); dialog?.querySelector('form')?.reset(); return; }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton && appShell.contains(pageButton)) { state.page = pageButton.dataset.page; document.querySelector('#sidebar').classList.remove('open'); render(); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === 'add-student') document.querySelector('#studentDialog').showModal();
  else if (action === 'new-training') openTrainingDialog();
  else if (action === 'attendance') openAttendance(actionButton.dataset.id);
  else if (action === 'mark-paid') { const student = state.students.find(s => s.id === Number(actionButton.dataset.id)); student.fee = 'paid'; persistLocalData(); render(); showToast('Aidat yerel veritabanına kaydedildi.'); }
  else if (action === 'profile') { state.selectedStudentId = Number(actionButton.dataset.id); state.page = 'studentProfile'; const studentDialog = document.querySelector('#studentDialog'); const attendanceDialog = document.querySelector('#attendanceDialog'); if (studentDialog.open) studentDialog.close(); if (attendanceDialog.open) attendanceDialog.close(); render(); }
  else if (action === 'calendar-added') showToast('Antrenman takvime eklendi.');
  else showToast('Bu işlem sonraki geliştirme adımında açılacak.');
});

appContent.addEventListener('input', event => {
  if (event.target.id !== 'studentSearch' && event.target.id !== 'groupFilter') return;
  const query = (document.querySelector('#studentSearch')?.value || '').toLocaleLowerCase('tr');
  const group = document.querySelector('#groupFilter')?.value || '';
  const filtered = state.students.filter(s => (!query || `${s.name} ${s.parent}`.toLocaleLowerCase('tr').includes(query)) && (!group || s.group === group));
  document.querySelector('#studentsBody').innerHTML = studentRows(filtered);
});

document.querySelector('#studentForm').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const birth = new Date(data.get('birthDate'));
  state.students.unshift({ id: Date.now(), name: data.get('studentName'), birth: birth.toLocaleDateString('tr-TR'), group: data.get('group'), position: data.get('position'), parent: data.get('parentName'), phone: data.get('phone'), email: data.get('email'), address: data.get('address'), fee: 'pending', attendance: 100 });
  persistLocalData();
  document.querySelector('#studentDialog').close(); event.currentTarget.reset(); state.page = 'students'; render(); showToast('Öğrenci yerel veritabanına kaydedildi.');
});
document.querySelector('#attendanceForm').addEventListener('submit', event => {
  event.preventDefault();
  const presentStudentIds = [...document.querySelectorAll('#attendanceList [data-student-id]:checked')].map(input => Number(input.dataset.studentId));
  state.attendanceRecords.unshift({ id: Date.now(), trainingId: state.activeTrainingId, date: new Date().toISOString(), presentStudentIds });
  persistLocalData();
  document.querySelector('#attendanceDialog').close();
  showToast('Yoklama yerel veritabanına kaydedildi.');
});
document.querySelector('#trainingForm').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const group = data.get('group');
  state.trainings.push({
    id: Date.now(),
    date: data.get('date'),
    time: data.get('time'),
    duration: Number(data.get('duration')),
    group,
    title: data.get('title').trim(),
    coach: data.get('coach').trim(),
    field: data.get('field').trim(),
    count: state.students.filter(student => student.group === group).length
  });
  persistLocalData();
  document.querySelector('#trainingDialog').close();
  event.currentTarget.reset();
  state.page = 'trainings';
  render();
  showToast('Antrenman yerel veritabanına kaydedildi.');
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
