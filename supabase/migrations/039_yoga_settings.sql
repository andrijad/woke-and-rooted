-- 039: Joga kao jedna celina — naziv i opis su zajednički (u studio_settings), a grupe imaju samo
-- naziv, termine, cenu i kapacitet. Opisi pojedinačnih grupa (groups.description_*) ostaju u bazi, ali se ne koriste.

alter table public.studio_settings add column if not exists yoga_title text not null default 'Redovna joga';
alter table public.studio_settings add column if not exists yoga_description_short text;
alter table public.studio_settings add column if not exists yoga_description_html text;
