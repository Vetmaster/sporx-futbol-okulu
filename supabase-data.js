(function () {
  const PAGE_SIZE = 1000;

  function monthKey(value) {
    return String(value || '').slice(0, 7);
  }

  function notificationDate(value) {
    if (!value) return '';
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = candidate => candidate.toDateString() === date.toDateString();
    if (sameDay(today)) return 'Bugün';
    if (sameDay(yesterday)) return 'Dün';
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(date);
  }

  async function fetchAll(client, table, columns, order = 'id') {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from(table)
        .select(columns)
        .order(order, { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) return rows;
    }
  }

  function create(client) {
    let schoolId = null;
    let userId = null;
    let groupsByName = new Map();

    function requireContext() {
      if (!schoolId) throw new Error('Okul bağlantısı kurulamadı.');
    }

    function groupId(name) {
      const id = groupsByName.get(name);
      if (!id) throw new Error(`“${name}” antrenman grubu Supabase’de bulunamadı.`);
      return id;
    }

    async function load(profile) {
      schoolId = profile.school_id;
      userId = profile.user_id;
      requireContext();

      const [
        groupsResult,
        studentsRows,
        feeRows,
        trainingRows,
        accountingRows,
        notificationRows,
        attendanceRows,
        accessRequestRows
      ] = await Promise.all([
        client.from('training_groups').select('id, name, sort_order').order('sort_order'),
        fetchAll(client, 'students', 'id, full_name, birth_date, birth_year, position, guardian_name, phone, email, address, notes, enrollment_date, fee_tracking_start_date, attendance_rate, training_groups(name)'),
        fetchAll(client, 'fee_periods', 'id, student_id, fee_month, status, amount, due_date, paid_at, payment_method, note, source'),
        fetchAll(client, 'trainings', 'id, training_date, start_time, duration_minutes, title, coach, field, training_groups(name)', 'training_date'),
        fetchAll(client, 'accounting_entries', 'id, student_id, fee_period_id, occurred_on, title, kind, amount, payment_method, source, reference', 'occurred_on'),
        fetchAll(client, 'notifications', 'id, audience, title, body, status, sent_at, created_at', 'created_at'),
        fetchAll(client, 'attendance_sessions', 'id, training_id, taken_at, attendance_records(student_id, present)', 'taken_at'),
        fetchAll(client, 'access_requests', 'id, user_id, email, full_name, requested_role, status, reviewed_at, created_at', 'created_at')
      ]);

      if (groupsResult.error) throw groupsResult.error;
      const groups = groupsResult.data || [];
      groupsByName = new Map(groups.map(group => [group.name, group.id]));

      const feesByStudent = new Map();
      feeRows.forEach(row => {
        if (!feesByStudent.has(Number(row.student_id))) feesByStudent.set(Number(row.student_id), []);
        feesByStudent.get(Number(row.student_id)).push(row);
      });
      const currentMonth = new Date().toISOString().slice(0, 7);

      const students = studentsRows.map(row => {
        const fees = feesByStudent.get(Number(row.id)) || [];
        const feePayments = Object.fromEntries(fees.map(fee => [monthKey(fee.fee_month), fee.status]));
        const feeHistory = Object.fromEntries(fees.map(fee => [monthKey(fee.fee_month), {
          status: fee.status,
          amount: fee.amount === null ? null : Number(fee.amount),
          note: fee.note,
          source: fee.source,
          paymentMethod: fee.payment_method,
          paidAt: fee.paid_at
        }]));
        return {
          id: Number(row.id),
          name: row.full_name,
          birth: row.birth_date || row.birth_year || '',
          group: row.training_groups?.name || 'Atanmamış',
          position: row.position || '',
          parent: row.guardian_name || '',
          phone: row.phone || '',
          email: row.email || '',
          address: row.address || '',
          notes: row.notes || '',
          enrollmentDate: row.enrollment_date,
          feeTrackingStartDate: row.fee_tracking_start_date,
          feePayments,
          feeHistory,
          fee: feePayments[currentMonth] || 'none',
          attendance: Number(row.attendance_rate || 0)
        };
      });

      const trainings = trainingRows.map(row => ({
        id: Number(row.id),
        date: row.training_date,
        time: String(row.start_time || '').slice(0, 5),
        duration: Number(row.duration_minutes),
        group: row.training_groups?.name || 'Atanmamış',
        title: row.title,
        coach: row.coach,
        field: row.field
      }));

      const accountingEntries = accountingRows.map(row => ({
        id: Number(row.id),
        date: row.occurred_on,
        title: row.title,
        type: row.kind === 'income' ? 'Gelir' : 'Gider',
        amount: Number(row.amount),
        kind: row.kind,
        paymentMethod: row.payment_method,
        source: row.source,
        reference: row.reference,
        studentId: row.student_id ? Number(row.student_id) : null,
        feePeriodId: row.fee_period_id ? Number(row.fee_period_id) : null
      }));

      const notifications = notificationRows
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
        .map(row => {
          const timestamp = row.sent_at || row.created_at;
          return {
            id: Number(row.id),
            date: notificationDate(timestamp),
            title: row.title,
            body: row.body,
            audience: row.audience,
            time: new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)),
            status: row.status === 'sent' ? 'Teslim edildi' : row.status === 'failed' ? 'Başarısız' : row.status === 'queued' ? 'Sırada' : 'Taslak'
          };
        });

      const attendanceRecords = attendanceRows.map(row => ({
        id: Number(row.id),
        trainingId: Number(row.training_id),
        date: row.taken_at,
        presentStudentIds: (row.attendance_records || []).filter(record => record.present).map(record => Number(record.student_id))
      }));

      const accessRequests = accessRequestRows
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
        .map(row => ({
          id: Number(row.id),
          userId: row.user_id,
          email: row.email,
          fullName: row.full_name,
          requestedRole: row.requested_role,
          status: row.status,
          reviewedAt: row.reviewed_at,
          createdAt: row.created_at
        }));

      return {
        schoolId,
        groups,
        students,
        trainings,
        accountingEntries,
        notifications,
        attendanceRecords,
        accessRequests
      };
    }

    async function saveStudent(student, isNew) {
      requireContext();
      const birthValue = String(student.birth || '');
      const birthMatch = birthValue.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      const normalizedBirthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthValue)
        ? birthValue
        : birthMatch ? `${birthMatch[3]}-${birthMatch[2].padStart(2, '0')}-${birthMatch[1].padStart(2, '0')}` : null;
      const payload = {
        school_id: schoolId,
        group_id: groupId(student.group),
        full_name: student.name,
        birth_date: normalizedBirthDate,
        birth_year: /^\d{4}$/.test(birthValue) ? Number(birthValue) : null,
        position: student.position || null,
        guardian_name: student.parent || null,
        phone: student.phone || null,
        email: student.email || null,
        address: student.address || null,
        notes: student.notes || null,
        enrollment_date: student.enrollmentDate,
        fee_tracking_start_date: student.feeTrackingStartDate,
        attendance_rate: Number(student.attendance || 0)
      };
      const query = isNew
        ? client.from('students').insert(payload)
        : client.from('students').update(payload).eq('id', student.id);
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      return Number(data.id);
    }

    async function saveTraining(training, isNew) {
      requireContext();
      const payload = {
        school_id: schoolId,
        group_id: groupId(training.group),
        training_date: training.date,
        start_time: training.time,
        duration_minutes: training.duration,
        title: training.title,
        coach: training.coach,
        field: training.field
      };
      const query = isNew
        ? client.from('trainings').insert(payload)
        : client.from('trainings').update(payload).eq('id', training.id);
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      return Number(data.id);
    }

    async function saveAccounting(entry, isNew) {
      requireContext();
      const payload = {
        school_id: schoolId,
        occurred_on: entry.date,
        title: entry.title,
        kind: entry.kind,
        amount: entry.amount,
        payment_method: entry.paymentMethod,
        source: entry.source || 'manual',
        reference: entry.reference || null,
        student_id: entry.studentId || null,
        created_by: userId
      };
      const query = isNew
        ? client.from('accounting_entries').insert(payload)
        : client.from('accounting_entries').update(payload).eq('id', entry.id);
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      return Number(data.id);
    }

    async function deleteAccounting(id) {
      const { error } = await client.from('accounting_entries').delete().eq('id', id);
      if (error) throw error;
    }

    async function saveFeeStatus(student, month, status, amount) {
      requireContext();
      const feeMonth = `${month}-01`;
      const reference = `fee:${student.id}:${month}`;
      const paid = status === 'paid';
      const feePayload = {
        school_id: schoolId,
        student_id: student.id,
        fee_month: feeMonth,
        status,
        amount: status === 'none' ? null : Number(amount || 1500),
        due_date: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10),
        paid_at: paid ? new Date().toISOString() : null,
        payment_method: paid ? 'cash' : null,
        note: status === 'none' ? 'Aidat yok' : null,
        source: 'app'
      };
      const { data: feePeriod, error: feeError } = await client
        .from('fee_periods')
        .upsert(feePayload, { onConflict: 'student_id,fee_month' })
        .select('id')
        .single();
      if (feeError) throw feeError;

      if (paid) {
        const { data: existingEntry, error: existingError } = await client
          .from('accounting_entries')
          .select('id')
          .eq('school_id', schoolId)
          .eq('reference', reference)
          .maybeSingle();
        if (existingError) throw existingError;
        const accountingPayload = {
          school_id: schoolId,
          student_id: student.id,
          fee_period_id: feePeriod.id,
          occurred_on: new Date().toISOString().slice(0, 10),
          title: `${student.name} · ${month} aidatı`,
          kind: 'income',
          amount: Number(amount || 1500),
          payment_method: 'cash',
          source: 'fee',
          reference,
          created_by: userId
        };
        const accountingQuery = existingEntry
          ? client.from('accounting_entries').update(accountingPayload).eq('id', existingEntry.id)
          : client.from('accounting_entries').insert(accountingPayload);
        const { error } = await accountingQuery;
        if (error) throw error;
      } else {
        const { error } = await client.from('accounting_entries').delete().eq('school_id', schoolId).eq('reference', reference);
        if (error) throw error;
      }
    }

    async function saveAttendance(trainingId, allStudentIds, presentStudentIds) {
      requireContext();
      const { data: session, error: sessionError } = await client
        .from('attendance_sessions')
        .upsert({
          school_id: schoolId,
          training_id: trainingId,
          taken_by: userId,
          taken_at: new Date().toISOString()
        }, { onConflict: 'training_id' })
        .select('id')
        .single();
      if (sessionError) throw sessionError;

      const presentSet = new Set(presentStudentIds.map(Number));
      if (allStudentIds.length) {
        const { error: upsertError } = await client.from('attendance_records').upsert(
        allStudentIds.map(studentId => ({
          session_id: session.id,
          student_id: studentId,
          present: presentSet.has(Number(studentId))
        })), { onConflict: 'session_id,student_id' });
        if (upsertError) throw upsertError;
        const { error: cleanupError } = await client
          .from('attendance_records')
          .delete()
          .eq('session_id', session.id)
          .not('student_id', 'in', `(${allStudentIds.join(',')})`);
        if (cleanupError) throw cleanupError;
      } else {
        const { error: deleteError } = await client.from('attendance_records').delete().eq('session_id', session.id);
        if (deleteError) throw deleteError;
      }
      return Number(session.id);
    }

    async function saveNotification(notification) {
      requireContext();
      const { data, error } = await client.from('notifications').insert({
        school_id: schoolId,
        audience: notification.audience,
        title: notification.title,
        body: notification.body,
        status: 'draft',
        sent_by: userId
      }).select('id, created_at').single();
      if (error) throw error;
      return { id: Number(data.id), createdAt: data.created_at };
    }

    async function approveAccessRequest(requestId, role) {
      const { error } = await client.rpc('approve_access_request', {
        target_request_id: requestId,
        approved_role: role
      });
      if (error) throw error;
    }

    async function rejectAccessRequest(requestId) {
      const { error } = await client.rpc('reject_access_request', {
        target_request_id: requestId
      });
      if (error) throw error;
    }

    async function revokeAccessRequestApproval(requestId) {
      const { error } = await client.rpc('revoke_access_request_approval', {
        target_request_id: requestId
      });
      if (error) throw error;
    }

    return {
      load,
      saveStudent,
      saveTraining,
      saveAccounting,
      deleteAccounting,
      saveFeeStatus,
      saveAttendance,
      saveNotification,
      approveAccessRequest,
      rejectAccessRequest,
      revokeAccessRequestApproval
    };
  }

  window.SasaSupabaseData = { create };
})();
