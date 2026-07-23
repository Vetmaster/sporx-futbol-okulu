import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
globalThis.window = {};
await import(pathToFileURL(path.join(projectDirectory, 'students-seed.js')).href);

const rows = globalThis.window.SporXImportedStudentRows || [];
const feeMonths = [
  '2024-08-01', '2024-09-01', '2024-10-01', '2024-11-01',
  '2024-12-01', '2025-01-01', '2025-02-01', '2025-03-01',
  '2025-04-01', '2025-05-01', '2025-06-01', '2025-07-01'
];
const baseGroups = ['Saat 09:00', 'Saat 10:00', 'Saat 11:00', 'Saat 12:00', 'U11', 'U12', 'U13', 'U14'];
const positions = ['Kaleci', 'Defans', 'Defans', 'Defans', 'Orta saha', 'Orta saha', 'Orta saha', 'Orta saha', 'Forvet', 'Forvet'];

function stableIndex(index) {
  let value = Math.imul(Number(index) + 1, 2654435761) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function normalizeGroup(value, index) {
  const group = String(value || '').trim();
  if (/^(9|10|11|12|13|14|15)$/.test(group)) return `Saat ${group.padStart(2, '0')}:00`;
  if (!group || group === '0' || group === 'Atanmamış' || group.toLocaleLowerCase('tr-TR') === 'x') {
    return baseGroups[stableIndex(index) % baseGroups.length];
  }
  return group;
}

function feeRecord(value) {
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
}

const students = rows.map((row, index) => ({
  id: index + 1,
  full_name: row[0],
  birth_year: Number(row[1]) || null,
  group_name: normalizeGroup(row[2], index),
  position: positions[stableIndex(index) % positions.length],
  phone: row[3] || null,
  notes: row[4] || null,
  enrollment_date: row[5] || '2026-07-22',
  fee_tracking_start_date: '2026-07-01'
}));

const fees = rows.flatMap((row, studentIndex) => {
  const historical = feeMonths.flatMap((feeMonth, feeIndex) => {
    const record = feeRecord(row[6]?.[feeIndex]);
    return record ? [{
      student_id: studentIndex + 1,
      fee_month: feeMonth,
      ...record
    }] : [];
  });
  return [...historical, {
    student_id: studentIndex + 1,
    fee_month: '2026-07-01',
    status: 'none',
    amount: null,
    note: 'Aidat yok',
    source: 'initial'
  }];
});

const groupNames = [...new Set(students.map(student => student.group_name))];
const sql = `-- Generated from students-seed.js. Do not edit by hand.
insert into public.training_groups (school_id, name, sort_order)
select schools.id, source.name, source.sort_order
from public.schools
cross join jsonb_to_recordset($groups$${JSON.stringify(groupNames.map((name, index) => ({ name, sort_order: index + 1 })))}$groups$::jsonb)
  as source(name text, sort_order integer)
where schools.slug = 'sasa-futbol'
on conflict (school_id, name) do nothing;

with source as (
  select *
  from jsonb_to_recordset($students$${JSON.stringify(students)}$students$::jsonb)
    as row(
      id bigint,
      full_name text,
      birth_year smallint,
      group_name text,
      position text,
      phone text,
      notes text,
      enrollment_date date,
      fee_tracking_start_date date
    )
)
insert into public.students (
  id,
  school_id,
  group_id,
  full_name,
  birth_year,
  position,
  phone,
  notes,
  enrollment_date,
  fee_tracking_start_date,
  attendance_rate
)
select
  source.id,
  schools.id,
  groups.id,
  source.full_name,
  source.birth_year,
  source.position,
  source.phone,
  source.notes,
  source.enrollment_date,
  source.fee_tracking_start_date,
  0
from source
join public.schools on schools.slug = 'sasa-futbol'
join public.training_groups as groups
  on groups.school_id = schools.id
 and groups.name = source.group_name;

select setval(
  pg_get_serial_sequence('public.students', 'id'),
  greatest((select max(id) from public.students), 1),
  true
);

with source as (
  select *
  from jsonb_to_recordset($fees$${JSON.stringify(fees)}$fees$::jsonb)
    as row(
      student_id bigint,
      fee_month date,
      status text,
      amount numeric,
      note text,
      source text
    )
)
insert into public.fee_periods (
  school_id,
  student_id,
  fee_month,
  status,
  amount,
  due_date,
  paid_at,
  note,
  source
)
select
  students.school_id,
  source.student_id,
  source.fee_month,
  source.status,
  source.amount,
  (source.fee_month + interval '1 month - 1 day')::date,
  case when source.status = 'paid' then (source.fee_month + interval '14 days')::timestamptz end,
  source.note,
  source.source
from source
join public.students on students.id = source.student_id;

insert into public.trainings (
  school_id, group_id, training_date, start_time, duration_minutes, title, coach, field
)
select schools.id, groups.id, source.training_date, source.start_time, source.duration_minutes, source.title, source.coach, source.field
from public.schools
join public.training_groups as groups on groups.school_id = schools.id
cross join (
  values
    ('Saat 09:00', date '2026-07-20', time '09:00', 90, 'Teknik Antrenman', 'Oğuz Yalçın', 'Ana saha'),
    ('U12', date '2026-07-20', time '18:00', 90, 'Taktik Çalışma', 'Serkan Aydın', 'Ana saha'),
    ('U14', date '2026-07-21', time '19:30', 90, 'Maç Hazırlığı', 'Oğuz Yalçın', 'Saha 2')
) as source(group_name, training_date, start_time, duration_minutes, title, coach, field)
where schools.slug = 'sasa-futbol'
  and groups.name = source.group_name;

insert into public.accounting_entries (
  school_id, occurred_on, title, kind, amount, payment_method, source
)
select schools.id, source.occurred_on, source.title, source.kind, source.amount, source.payment_method, 'initial'
from public.schools
cross join (
  values
    (date '2026-07-18', 'Aylık aidat tahsilatları', 'income', 18000::numeric, 'cash'),
    (date '2026-07-17', 'Saha kiralama', 'expense', 6500::numeric, 'transfer'),
    (date '2026-07-15', 'Forma satışları', 'income', 9200::numeric, 'card'),
    (date '2026-07-12', 'Antrenman ekipmanı', 'expense', 3850::numeric, 'card')
) as source(occurred_on, title, kind, amount, payment_method)
where schools.slug = 'sasa-futbol';

insert into public.notifications (
  school_id, audience, title, body, status, sent_at
)
select schools.id, source.audience, source.title, source.body, 'sent', source.sent_at
from public.schools
cross join (
  values
    ('U12 velileri', 'Hafta sonu hazırlık maçı', 'Hafta sonu hazırlık maçı bilgilendirmesi.', timestamptz '2026-07-23 10:14:00+03'),
    ('Tüm veliler', 'Temmuz aidat hatırlatması', 'Temmuz ayı aidat hatırlatması.', timestamptz '2026-07-22 09:00:00+03'),
    ('Saat 09:00 velileri', 'Antrenman sahası değişikliği', 'Antrenman sahası değişikliği bilgilendirmesi.', timestamptz '2026-07-15 16:24:00+03')
) as source(audience, title, body, sent_at)
where schools.slug = 'sasa-futbol';
`;

const outputPath = path.join(
  projectDirectory,
  'supabase',
  'migrations',
  '20260723172000_import_seed_data.sql'
);
fs.writeFileSync(outputPath, sql);
console.log(JSON.stringify({
  output: path.relative(projectDirectory, outputPath),
  students: students.length,
  feePeriods: fees.length,
  groups: groupNames.length
}));

