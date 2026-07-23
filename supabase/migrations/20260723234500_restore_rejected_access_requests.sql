update public.access_requests
set
  status = 'pending',
  reviewed_by = null,
  reviewed_at = null
where status = 'rejected';
