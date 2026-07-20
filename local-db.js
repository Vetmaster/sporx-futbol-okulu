(function () {
  const STORAGE_KEY = 'sporx.localdb.v1';
  const VERSION = 5;

  const seed = {
    version: VERSION,
    students: [
      { id: 1, name: 'Ege Arslan', birth: '14.03.2014', group: 'U12', position: 'Orta saha', parent: 'Ayşe Arslan', phone: '0532 111 22 33', email: 'ayse@example.com', address: 'Merkez', enrollmentDate: '2026-07-01', feePayments: { '2026-07': 'paid' }, fee: 'paid', attendance: 92 },
      { id: 2, name: 'Mert Kaya', birth: '02.09.2013', group: 'U13', position: 'Forvet', parent: 'Emre Kaya', phone: '0542 222 34 56', email: 'emre@example.com', address: 'Merkez', enrollmentDate: '2026-07-01', feePayments: { '2026-07': 'late' }, fee: 'late', attendance: 84 },
      { id: 3, name: 'Arda Demir', birth: '21.06.2015', group: 'U11', position: 'Defans', parent: 'Selin Demir', phone: '0533 333 45 67', email: 'selin@example.com', address: 'Merkez', enrollmentDate: '2026-07-01', feePayments: { '2026-07': 'pending' }, fee: 'pending', attendance: 96 },
      { id: 4, name: 'Can Eren', birth: '07.11.2014', group: 'U12', position: 'Kaleci', parent: 'Burak Eren', phone: '0548 444 56 78', email: 'burak@example.com', address: 'Merkez', enrollmentDate: '2026-07-01', feePayments: { '2026-07': 'paid' }, fee: 'paid', attendance: 88 },
      { id: 5, name: 'Deniz Yılmaz', birth: '30.01.2016', group: 'Saat 09:00', position: 'Forvet', parent: 'Derya Yılmaz', phone: '0539 555 67 89', email: 'derya@example.com', address: 'Merkez', enrollmentDate: '2026-07-01', feePayments: { '2026-07': 'late' }, fee: 'late', attendance: 79 }
    ],
    trainings: [
      { id: 1, date: '2026-07-20', time: '09:00', duration: 90, group: 'Saat 09:00', title: 'Teknik Antrenman', coach: 'Oğuz Yalçın', field: 'Ana saha' },
      { id: 2, date: '2026-07-20', time: '18:00', duration: 90, group: 'U12', title: 'Taktik Çalışma', coach: 'Serkan Aydın', field: 'Ana saha' },
      { id: 3, date: '2026-07-21', time: '19:30', duration: 90, group: 'U14', title: 'Maç Hazırlığı', coach: 'Oğuz Yalçın', field: 'Saha 2' }
    ],
    accountingEntries: [
      { id: 1, date: '18 Tem', title: 'Aylık aidat tahsilatları', type: 'Gelir', amount: 18000, kind: 'income' },
      { id: 2, date: '17 Tem', title: 'Saha kiralama', type: 'Gider', amount: 6500, kind: 'expense' },
      { id: 3, date: '15 Tem', title: 'Forma satışları', type: 'Gelir', amount: 9200, kind: 'income' },
      { id: 4, date: '12 Tem', title: 'Antrenman ekipmanı', type: 'Gider', amount: 3850, kind: 'expense' }
    ],
    notifications: [
      { id: 1, date: 'Bugün', title: 'Hafta sonu hazırlık maçı', audience: 'U12 velileri', time: '10:14', status: 'Teslim edildi' },
      { id: 2, date: 'Dün', title: 'Temmuz aidat hatırlatması', audience: 'Tüm veliler', time: '09:00', status: 'Teslim edildi' },
      { id: 3, date: '15 Tem', title: 'Antrenman sahası değişikliği', audience: 'Saat 09:00 velileri', time: '16:24', status: 'Teslim edildi' }
    ],
    attendanceRecords: [],
    updatedAt: null
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  let memoryFallback = clone(seed);
  let storageEnabled = false;

  try {
    const probe = '__sporx_storage_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    storageEnabled = true;
  } catch (error) {
    storageEnabled = false;
  }

  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    const migrateGroup = group => group === 'U10' ? 'Saat 09:00' : group;
    const sourceStudents = Array.isArray(source.students) ? source.students : clone(seed.students);
    const sourceTrainings = Array.isArray(source.trainings) ? source.trainings : clone(seed.trainings);
    const sourceNotifications = Array.isArray(source.notifications) ? source.notifications : clone(seed.notifications);
    return {
      version: VERSION,
      students: sourceStudents.map(student => {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const feePayments = student.feePayments && typeof student.feePayments === 'object' && !Array.isArray(student.feePayments) ? { ...student.feePayments } : { [currentMonth]: student.fee || 'pending' };
        return { ...student, group: migrateGroup(student.group), enrollmentDate: student.enrollmentDate || '2026-07-01', feePayments };
      }),
      trainings: sourceTrainings.map(training => {
        const { count, ...trainingData } = training;
        return { ...trainingData, date: training.date || '2026-07-20', duration: Number(training.duration) || 90, group: migrateGroup(training.group), time: training.group === 'U10' ? '09:00' : training.time };
      }),
      accountingEntries: Array.isArray(source.accountingEntries) ? source.accountingEntries : clone(seed.accountingEntries),
      notifications: sourceNotifications.map(notification => ({ ...notification, audience: notification.audience === 'U10 velileri' ? 'Saat 09:00 velileri' : notification.audience })),
      attendanceRecords: Array.isArray(source.attendanceRecords) ? source.attendanceRecords : [],
      updatedAt: source.updatedAt || null
    };
  }

  function load() {
    if (!storageEnabled) return clone(memoryFallback);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        return clone(seed);
      }
      return normalize(JSON.parse(saved));
    } catch (error) {
      storageEnabled = false;
      return clone(memoryFallback);
    }
  }

  function save(data) {
    const normalized = normalize({ ...data, updatedAt: new Date().toISOString() });
    memoryFallback = clone(normalized);
    if (storageEnabled) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch (error) {
        storageEnabled = false;
      }
    }
    return clone(normalized);
  }

  function reset() {
    memoryFallback = clone(seed);
    if (storageEnabled) localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return clone(seed);
  }

  window.SporXDB = { load, save, reset, isPersistent: () => storageEnabled, storageKey: STORAGE_KEY };
})();
