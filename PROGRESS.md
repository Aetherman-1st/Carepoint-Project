Group 1.1: applied supabase/files.sql live; uploaded_files/file_scan_logs exist with RLS on and no anon/authenticated grants.
Group 1.2: added durable UPLOAD_RATE_LIMITER Worker binding (20/min per user) and wired it into upload routing.
Group 1.3: live throwaway test passed JPG/PNG/PDF approval, wrong extension/signature and >2MB rejection, owner download 200, anonymous 401; scan result is structural_pass_no_av.
Group 2.4: admin TOTP enrollment/challenge and AAL2 gate implemented; is_admin_aal2 function created; live RLS policy rewrite blocked because admin tables are owned by postgres and carepoint_app is not owner (retried once).
Group 2.5: 5-minute password re-entry modal wired before ban/unban/delete, status changes, and replies.
Group 2.6: admin forgot/reset pages added with generic responses; Supabase redirect URL/SMTP changes blocked (no Supabase management token or SMTP secret).
Group 2.7: admin login errors are generic; public Auth settings checked; hosted Auth rate-limit/MFA settings are not exposed and could not be raised without management access.
Group 2.8: Worker audit logging added for public login success/failure/lockout/password changes and admin actions; DB trigger migration authored but blocked by postgres-owned tables.
Group 2.9: strict admin CSP/security headers added; admin JWT lifetime shortening blocked (no Supabase management access).
