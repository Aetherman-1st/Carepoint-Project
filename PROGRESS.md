Group 1.1: applied supabase/files.sql live; uploaded_files/file_scan_logs exist with RLS on and no anon/authenticated grants.
Group 1.2: added durable UPLOAD_RATE_LIMITER Worker binding (20/min per user) and wired it into upload routing.
Group 1.3: live throwaway test passed JPG/PNG/PDF approval, wrong extension/signature and >2MB rejection, owner download 200, anonymous 401; scan result is structural_pass_no_av.
