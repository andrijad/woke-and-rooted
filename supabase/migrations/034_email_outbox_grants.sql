-- 034: Edge funkcija send-emails radi kao service_role; 033 joj je oduzela pravo da zove funkcije reda.
grant execute on function public.claim_emails(int, int) to service_role;
grant execute on function public.finish_email(bigint, boolean, text) to service_role;
