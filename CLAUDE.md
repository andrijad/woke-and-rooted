# Joga studio — aplikacija za upravljanje studiom

Aplikacija za studio joge (vlasnica = admin; članovi = korisnici). Vite + React 19 + react-router + Supabase (Postgres, Auth, RLS). Jezik interfejsa: **srpski, latinica**. Vlasnik projekta: Andrija (Tech PM) — komunikacija na srpskom, objašnjenja kratka i praktična.

## Komande
- `npm run dev` — lokalno (Vite, obično :5173)
- `npm run build` — mora da prolazi pre svakog PR-a
- `npm run lint` — ima poznatih strogih react-hooks upozorenja (AuthContext, useRefreshOnFocus, SignupsOverview `init`, `useEffect` zavisnosti); nove greške ne uvoditi
- Env: `.env` sa `VITE_SUPABASE_URL` i `VITE_SUPABASE_KEY` (nikad u git)

## Struktura
- `src/pages/Login|ForgotPassword|ResetPassword.jsx` — prijava i reset lozinke
- `src/pages/AdminHome.jsx` — tabovi: **Članovi** (MembersManager), **Grupe i događaji** (GroupsAndEvents → GroupsManager / EventsManager, samo definicije), **Termini i uplate** (SignupsOverview, prijave + potvrda uplate)
- `src/pages/MemberHome.jsx` — SignupCard (redovna joga), DropinCard (individualni čas), EventsCard (događaji/radionice)
- `src/lib/` — `ips.js` (IPS QR + pozivi na broj), `schedule.js` (termini grupa), `events.js`, `useRefreshOnFocus.js`, `supabaseClient.js`
- `supabase/migrations/` — SQL migracije, numerisane redom (001…). `010` je namerno preskočena (zamenjena sa `013`).

## Model podataka (ukratko)
- `profiles` (id, full_name, phone, email, is_admin, is_manual). `is_manual = true` → član bez naloga, kojeg vodi vlasnica (id nije u auth.users).
- `groups` (monthly_price, dropin_price, capacity, active, archived) + `group_schedule` (dani/vreme).
- `group_signup_periods` — vlasnica otvara/zatvara prijave **po grupi i mesecu** (period = prvi dan meseca).
- `monthly_signups` — jedna grupa po članu po mesecu (unique index na member_id+period). Članovi sami biraju grupu iz otvorenih.
- `dropin_signups` — individualni časovi; `event_signups` — jednokratni događaji; `events` (capacity, archived, published).
- Dodela članova grupama (`group_memberships`, `admin_set_member_group`) je uklonjena u 019 — članovi sami biraju grupu iz otvorenih prijava.
- Statusi uplate: `due` → `paid`; potvrđuje samo vlasnica.

## Registracija
- Nalog se pravi samo preko pozivnog linka `/register?token=…` (tabela `invites`, važi 7 dana, jednokratno). Proveru radi trigger `handle_new_user`, ne frontend.
- Pozivnica može biti vezana za ručno dodatog člana (`invites.member_id`) — tada se njegova evidencija povezuje sa novim nalogom (id se prebacuje, FK imaju ON UPDATE CASCADE).
- Nalozi se ne prave iz Supabase dashboarda. Novi admin: registracija preko linka, pa `update profiles set is_admin = true where email = '…'`.
- Potvrda mejla zahteva sopstveni SMTP u Supabase-u.

## Pravila koja se lako pogrešno urade
- **RLS**: članovi vide samo svoje prijave. Za ukupan broj prijava (kapacitet) koristiti SECURITY DEFINER RPC: `count_monthly_signups`, `count_event_signups`.
- **Delete pod RLS-om ne vraća grešku, samo 0 redova.** Uvek `.delete()....select()` i proveriti dužinu rezultata.
- **Datumi**: nikad `toISOString()` za lokalne datume (UTC pomera dan). Koristiti `getFullYear/getMonth/getDate` sa padStart.
- Član može da poništi prijavu samo dok je `status = 'due'` (RLS politika `*_delete_own_due`).
- Kapacitet: pun termin/grupa → dugme "Prijavi se" zamenjuje "Grupa je popunjena". Ne važi za individualne časove.
- Arhivirano (`archived`) se ne prikazuje članovima; vlasnica ih vidi preko checkbox-a.
- Ažuriranje prikaza: `useRefreshOnFocus` (refetch na fokus prozora), nije realtime.

## Radni tok
- Radi se na **grani + pull request**, `main` ostaje stabilan. Pre PR-a: `npm run build`.
- **Migracije se ne pokreću automatski.** Novu SQL migraciju dodati u `supabase/migrations/` sa sledećim brojem, a vlasnik je ručno pokreće u Supabase SQL editoru. U PR opisu naglasiti da migraciju treba pokrenuti i kojim redosledom.
- Ne menjati postojeće migracije koje su već pokrenute; praviti novu.
- Stil je trenutno inline (`style={{…}}`) — logika i izgled su razdvojeni da se UI kasnije lako restilizuje. Završni dizajn se radi tek kad funkcionalnost bude gotova, prema referenci koju vlasnik da.
- Tajne (service role ključ, SMTP) nikad u repo ni u frontend kod.

## Odloženo / na redu
- Obaveštenja (email + PWA push; Viber kao kopirani tekst).
- Podešavanje sopstvenog SMTP-a (bez toga reset lozinke radi samo za članove Supabase tima).
- Završni UI dizajn; opciono Supabase Realtime.
