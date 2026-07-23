(function () {
  const STORAGE_KEY = 'sporx.localdb.v1';
  const VERSION = 11;
  const IMPORT_DATE = '2026-07-22';
  const IMPORT_MONTH = IMPORT_DATE.slice(0, 7);
  const HISTORICAL_FEE_MONTHS = ['2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07'];
  const normalizeImportedGroup = value => {
    const group = String(value || '').trim();
    if (/^(9|10|11|12|13|14|15)$/.test(group)) return `Saat ${group.padStart(2, '0')}:00`;
    if (!group || group === '0' || group.toLocaleLowerCase('tr-TR') === 'x') return 'Atanmamış';
    return group;
  };
  const historicalFeeRecord = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return { status: 'paid', amount: numericValue, source: String(value) };
    const source = String(value).trim();
    const normalized = source.toLocaleLowerCase('tr-TR').replace(/\.$/, '');
    if (normalized === 'yok') return { status: 'none', amount: null, note: 'Aidat yok', source };
    if (normalized === 'ücretsiz') return { status: 'exempt', amount: 0, note: 'Ücretsiz', source };
    if (normalized === 'yıllık') return { status: 'paid', amount: null, note: 'Yıllık ödeme', source };
    if (normalized === 'tatil') return { status: 'exempt', amount: null, note: 'Tatil', source };
    return { status: 'unknown', amount: null, note: source, source };
  };
  const importedFeeHistory = values => Object.fromEntries(HISTORICAL_FEE_MONTHS.flatMap((month, index) => {
    const record = historicalFeeRecord(values?.[index]);
    return record ? [[month, record]] : [];
  }));
  const importedStudents = (window.SporXImportedStudentRows || []).map((row, index) => ({
    id: index + 1,
    name: row[0],
    birth: row[1],
    group: normalizeImportedGroup(row[2]),
    position: '',
    parent: '',
    phone: row[3],
    email: '',
    address: '',
    notes: row[4],
    enrollmentDate: row[5] || IMPORT_DATE,
    feeTrackingStartDate: `${IMPORT_MONTH}-01`,
    feePayments: { [IMPORT_MONTH]: 'none' },
    feeHistory: importedFeeHistory(row[6]),
    fee: 'none',
    attendance: 0
  }));

  const seed = {
    version: VERSION,
    students: importedStudents,
    trainings: [
      { id: 1, date: '2026-07-20', time: '09:00', duration: 90, group: 'Saat 09:00', title: 'Teknik Antrenman', coach: 'Oğuz Yalçın', field: 'Ana saha' },
      { id: 2, date: '2026-07-20', time: '18:00', duration: 90, group: 'U12', title: 'Taktik Çalışma', coach: 'Serkan Aydın', field: 'Ana saha' },
      { id: 3, date: '2026-07-21', time: '19:30', duration: 90, group: 'U14', title: 'Maç Hazırlığı', coach: 'Oğuz Yalçın', field: 'Saha 2' }
    ],
    accountingEntries: [
      { id: 1, date: '18 Tem', title: 'Aylık aidat tahsilatları', type: 'Gelir', amount: 18000, kind: 'income', paymentMethod: 'cash' },
      { id: 2, date: '17 Tem', title: 'Saha kiralama', type: 'Gider', amount: 6500, kind: 'expense', paymentMethod: 'transfer' },
      { id: 3, date: '15 Tem', title: 'Forma satışları', type: 'Gelir', amount: 9200, kind: 'income', paymentMethod: 'card' },
      { id: 4, date: '12 Tem', title: 'Antrenman ekipmanı', type: 'Gider', amount: 3850, kind: 'expense', paymentMethod: 'card' }
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
    const sourceVersion = Number(source.version || 0);
    const shouldImportStudents = sourceVersion < 6;
    const shouldImportFeeHistory = sourceVersion < 7;
    const migrateGroup = group => group === 'U10' ? 'Saat 09:00' : group;
    const sourceStudents = shouldImportStudents ? clone(seed.students) : Array.isArray(source.students) ? source.students : clone(seed.students);
    const importedByName = new Map(seed.students.map(student => [String(student.name).trim().toLocaleUpperCase('tr-TR'), student]));
    const sourceTrainings = Array.isArray(source.trainings) ? source.trainings : clone(seed.trainings);
    const sourceNotifications = Array.isArray(source.notifications) ? source.notifications : clone(seed.notifications);
    return {
      version: VERSION,
      students: sourceStudents.map(student => {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const feePayments = student.feePayments && typeof student.feePayments === 'object' && !Array.isArray(student.feePayments) ? { ...student.feePayments } : { [currentMonth]: student.fee || 'none' };
        if (sourceVersion < 11) Object.keys(feePayments).forEach(month => {
          if (feePayments[month] === 'pending') feePayments[month] = 'none';
        });
        const importedStudent = importedByName.get(String(student.name).trim().toLocaleUpperCase('tr-TR'));
        const sourceFeeHistory = shouldImportFeeHistory && importedStudent ? clone(importedStudent.feeHistory) : student.feeHistory && typeof student.feeHistory === 'object' && !Array.isArray(student.feeHistory) ? { ...student.feeHistory } : {};
        const feeHistory = Object.fromEntries(Object.entries(sourceFeeHistory).map(([month, record]) => {
          const sourceStatus = String(record?.source || record?.note || '').trim().toLocaleLowerCase('tr-TR');
          if (sourceVersion < 10 && record?.status === 'late' && sourceStatus === 'yok') return [month, { ...record, status: 'none', note: 'Aidat yok' }];
          if (sourceVersion < 11 && record?.status === 'pending') return [month, { ...record, status: 'none', note: record.note === 'Bekliyor' ? 'Aidat yok' : record.note }];
          return [month, record];
        }));
        const fee = sourceVersion < 11 && student.fee === 'pending' ? 'none' : student.fee || 'none';
        return { ...student, group: migrateGroup(student.group), enrollmentDate: student.enrollmentDate || '2026-07-01', feePayments, feeHistory, fee };
      }),
      trainings: sourceTrainings.map(training => {
        const { count, ...trainingData } = training;
        return { ...trainingData, date: training.date || '2026-07-20', duration: Number(training.duration) || 90, group: migrateGroup(training.group), time: training.group === 'U10' ? '09:00' : training.time };
      }),
      accountingEntries: (Array.isArray(source.accountingEntries) ? source.accountingEntries : clone(seed.accountingEntries)).map(entry => ({ ...entry, paymentMethod: entry.paymentMethod || 'cash' })),
      notifications: sourceNotifications.map(notification => ({ ...notification, audience: notification.audience === 'U10 velileri' ? 'Saat 09:00 velileri' : notification.audience })),
      attendanceRecords: shouldImportStudents ? [] : Array.isArray(source.attendanceRecords) ? source.attendanceRecords : [],
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
    const normalized = normalize({ ...data, version: VERSION, updatedAt: new Date().toISOString() });
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
