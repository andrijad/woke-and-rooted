# Joga studio — aplikacija za upravljanje studiom

Aplikacija za studio joge (vlasnica = admin; članovi = korisnici). Vite + React 19 + react-router + Supabase (Postgres, Auth, RLS). Jezik interfejsa: **srpski, latinica**. Vlasnik projekta: Andrija (Tech PM) — komunikacija na srpskom, objašnjenja kratka i praktična.

## Komande
- `npm run dev` — lokalno (Vite, obično :5173)
- `npm run build` — mora da prolazi pre svakog PR-a
- `npm run lint` — ima poznatih strogih react-hooks upozorenja (AuthContext, useRefreshOnFocus, SignupsOverview `init`, `useEffect` zavisnosti); nove greške ne uvoditi
- Env: `.env` sa `VITE_SUPABASE_URL` i `VITE_SUPABASE_KEY` (nikad u git)

## Struktura
- `src/pages/Login|ForgotPassword|ResetPassword.jsx` — prijava i reset lozinke
- `src/pages/AdminHome.jsx` — tabovi: **Članovi** (MembersManager), **Grupe i događaji** (GroupsAndEvents → GroupsManager / EventsManager (predstojeći) / EventsManager `past` (prethodni), samo definicije), **Termini i uplate** (SignupsOverview, prijave + potvrda uplate)
- `src/pages/MemberHome.jsx` — SignupCard (redovna joga), EventsCard (događaji/radionice)
- `src/pages/OneOnOneForm.jsx` (`/seanse`, javno) i `OneOnOneStatus.jsx` (`/seanse/status/:token`, javno) — upit za 1 na 1 seanse; `admin/OneOnOneManager.jsx` (tab „1 na 1 seanse“); `member/OneOnOneCard.jsx`
- `src/lib/` — `ips.js` (IPS QR + pozivi na broj), `schedule.js` (termini grupa), `events.js`, `useRefreshOnFocus.js`, `supabaseClient.js`
- `supabase/migrations/` — SQL migracije, numerisane redom (001…). `010` je namerno preskočena (zamenjena sa `013`).

## Model podataka (ukratko)
- `profiles` (id, full_name, nickname, phone, email, email_secondary, is_admin, is_manual). `nickname` vidi/menja samo vlasnica (trigger `protect_profile_owner_fields`); ako postoji, koristi se u članovom interfejsu (`displayName` u `src/lib/names.js`), a vlasnica vidi „Ime (nadimak)“ (`ownerName`). Vlasnica menja podatke preko RPC `admin_update_member` (email za prijavu samo kod `is_manual`; `email_secondary` je samo kontakt). `is_manual = true` → član bez naloga, kojeg vodi vlasnica (id nije u auth.users).
- Joga je jedna celina: zajednički naziv i opis su u `studio_settings` (`yoga_title`, `yoga_description_short/html`, 039); grupe imaju samo naziv, termine, cenu i kapacitet (`groups.description_*` se više ne koriste). Član vidi jednu stavku „joga“ sa listom grupa po otvorenom mesecu; ako je prijavljen za mesec, vidi samo svoju grupu.
- `groups` (monthly_price, capacity, **active**; `archived` je samo odraz `not active` preko triggera `sync_group_flags`, 032) + `group_schedule` (dani/vreme).
- `group_signup_periods` — vlasnica otvara/zatvara prijave **po grupi i mesecu** (period = prvi dan meseca).
- `monthly_signups` — jedna grupa po članu po mesecu (unique index na member_id+period). Članovi sami biraju grupu iz otvorenih.
- `one_on_one_requests` — upiti za 1 na 1 seanse (gost ili član; statusi new → scheduled → paid / cancelled; gost prati status preko `access_token` kroz RPC `get_one_on_one_status`; poziv na broj se dodeljuje pri zakazivanju; cena u `studio_settings.session_price`). Mejlovi i notifikacije za upit, zakazivanje, promenu termina, uplatu (gost mejl, član notifikacija) i otkazivanje: 037.
- `event_signups` — jednokratni događaji (individualni časovi/`dropin_signups` uklonjeni u 023); `events` (capacity, **active**; `published`/`archived` se održavaju triggerom `sync_event_flags`, ne koristiti u UI). **Aktivno** = vidljivo članovima i u listi izmene; neaktivno vlasnica i dalje vidi i može da obriše. Događaj je „prošao“ od dana posle `coalesce(date_to, date_from)` (`isPastEvent` u `lib/events.js`): nestaje iz članovog prikaza, vlasnica ga vidi u „Prethodni događaji“.
- Dodela članova grupama (`group_memberships`, `admin_set_member_group`) je uklonjena u 019 — članovi sami biraju grupu iz otvorenih prijava.
- **Evidencija i istorija (032)**: brisanje grupe/događaja ne briše prijave (`ON DELETE SET NULL`, trigger snima `group_name` / `event_name`, `event_date_from/to` u prijavu). Član vidi „Istoriju“ (`member/HistoryCard`: joga, radionice, 1 na 1; prazne kategorije se kriju); RLS dozvoljava članu da čita događaje na koje je bio prijavljen. Vlasnica u „Termini i uplate“ ima „Evidenciju prethodnih termina“ (prošli meseci joge i prošli događaji, uključujući obrisane) sa potvrdom uplate i uklanjanjem. Iznos se prikazuje samo u zaglavlju grupe/događaja. Događaji imaju „Kopiraj događaj“ (ime `DUPLIKAT – …`, bez datuma, neaktivno).
- Statusi uplate: `due` → `paid`; potvrđuje samo vlasnica.

## Registracija
- Dve opcije: (1) javna forma `/registracija` (`pages/Registration.jsx`; `/register` je alias, stari `?token=` linkovi rade), (2) vlasnica dodaje člana ručno (`is_manual`). Forma ima honeypot i opcioni izbor grupe (RPC `get_open_groups_for_registration`; upis u grupu radi trigger `handle_new_user` uz proveru kapaciteta i otvorenog perioda).
- Nalog radi odmah. Mejl nije verifikovan dok se ne podesi SMTP, zato: ako se mejl poklapa sa ručnim članom, postavlja se `profiles.merge_candidate_id` i vlasnica u „Nove registracije“ potvrđuje spajanje (`admin_merge_member`) ili odbija (`admin_dismiss_merge`). Grupa se tada ne upisuje automatski.
- Svaka nova registracija dobija oznaku **nov član** (`profiles.is_new`); vlasnica je skida u „Izmeni“, a skida se i sama kad vlasnica doda člana u grupu/događaj (trigger `clear_new_on_admin_signup`). `profiles.email_verified` se sinhronizuje sa `auth.users.email_confirmed_at` (trigger `sync_email_verified`); u listi: ✓ ako je potvrđen, crveno „nije potvrđen“ ako nije. Spajanje sa evidencijom (merge) je u redu člana. Vlasnica može ručno da potvrdi email (`admin_confirm_email`, postavlja `auth.users.email_confirmed_at`, pa se član može prijaviti).
- Brisanje člana ide u dva koraka: **Arhiviraj** (`profiles.archived`, `admin_set_member_archived`; sakriven iz liste, vidljiv preko „Prikaži arhivirane“), pa **Obriši trajno** (`admin_delete_account(p_id, p_with_signups)`; ako član ima prijave traži se dodatna potvrda i brišu se i one). Radi i za članove bez naloga.
- Novi admin: registracija, pa `update profiles set is_admin = true where email = '…'`.
- Potvrda mejla zahteva sopstveni SMTP u Supabase-u.

## Bezbednost (audit 2026-10-17)
- Sigurnost podataka je u RLS-u i triggerima, ne u frontendu. Član ne sme da utiče na `status`/`amount` svoje prijave: `validate_member_monthly_signup` / `validate_member_event_signup` (028) ih postavljaju, uz proveru otvorenog perioda, kapaciteta i dostupnosti.
- Član ne menja `email`, `is_manual`, `nickname`, `merge_candidate_id` (trigger `protect_profile_owner_fields`).
- HTML iz editora uvek kroz `sanitizeHtml` (lista dozvoljenih oznaka). Bez `dangerouslySetInnerHTML` na drugim mestima.
- Security headeri i CSP su u `public/_headers`; nova spoljna domena (npr. Turnstile, analytics) mora da se doda u CSP.
- Service role ključ nikad u frontend. Novi SECURITY DEFINER funkcije: uvek `set search_path = public` i provera `is_admin()` iznutra.

## Pravila koja se lako pogrešno urade
- Logo u topbar-u je `components/HomeLogo.jsx` (vodi na `/`; kod vlasnice vraća na prvi tab).
- **RLS**: članovi vide samo svoje prijave. Za ukupan broj prijava (kapacitet) koristiti SECURITY DEFINER RPC: `count_monthly_signups`, `count_event_signups`.
- **Delete pod RLS-om ne vraća grešku, samo 0 redova.** Uvek `.delete()....select()` i proveriti dužinu rezultata.
- **Datumi**: nikad `toISOString()` za lokalne datume (UTC pomera dan). Koristiti `getFullYear/getMonth/getDate` sa padStart.
- Član može da poništi prijavu samo dok je `status = 'due'` (RLS politika `*_delete_own_due`).
- Kapacitet: pun termin/grupa → dugme "Prijavi se" zamenjuje "Grupa je popunjena".
- Neaktivno (`active = false`) se ne prikazuje članovima; vlasnica ih vidi preko checkbox-a u „Termini i uplate“.
- Ažuriranje prikaza: `useRefreshOnFocus` (refetch na fokus prozora), nije realtime.

## Radni tok
- Radi se na **grani + pull request**, `main` ostaje stabilan. Pre PR-a: `npm run build`.
- **Migracije se ne pokreću automatski.** Novu SQL migraciju dodati u `supabase/migrations/` sa sledećim brojem, a vlasnik je ručno pokreće u Supabase SQL editoru. U PR opisu naglasiti da migraciju treba pokrenuti i kojim redosledom.
- Ne menjati postojeće migracije koje su već pokrenute; praviti novu.
- **Dizajn**: stilovi su u `src/index.css` (CSS promenljive + klase: `.shell .topbar .card .signup(.is-due/.is-paid) .offer .notice .empty .tabs/.tab .badge .field .row .auth .auth-card`; dugmad: podrazumevano mahovina, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-on-moss`). Nove ekrane graditi klasama, bez `style={{…}}` osim sitnih razmaka. Boje brenda: mahovina `#4a5c36`, lan `#f2e8cc`, glina `#a05032`, kora `#5a4632`, slama `#bf9840` (plaćeno = mahovina, čeka uplatu = glina). Fontovi (self-hosted, `@fontsource-variable`): Antonio za naslove, Figtree za tekst. Logotipi i ikonice su u `public/brand/` (logo-brown/yellow/terracotta/green, symbol, yoga, cocoa, nature*).
- Tajne (service role ključ, SMTP) nikad u repo ni u frontend kod.

## Hosting (Cloudflare)
- Cloudflare Workers (statički assets) povezan sa GitHub repoom; `wrangler.jsonc` uključuje SPA fallback (`/registracija`, `/reset-password` moraju da rade na direktan link).
- `VITE_SUPABASE_URL` i `VITE_SUPABASE_KEY` se ugrađuju u build, pa moraju biti u **Settings → Build → Variables and secrets** (ne u runtime Variables). Posle promene: novi build/deploy.
- U Supabase → Authentication → URL Configuration: Site URL i Redirect URLs moraju sadržati adresu sajta (+ `/registracija`, `/reset-password`).

## Mejlovi i notifikacije
- Mejlovi aplikacije: red `email_outbox` → pg_cron → Edge funkcija `send-emails` → Resend (`noreply@wokeandrooted.com`). Detalji i podešavanje u `docs/mejlovi.md`. Novi mejl = šablon u Edge funkciji + `enqueue_email(...)` u triggeru. Edge funkcija se deploy-uje ručno iz Supabase Dashboard-a.
- Auth mejlovi (potvrda, reset lozinke): Supabase SMTP preko Resend-a, šabloni u `supabase/email-templates/` (ručno se ubacuju u Supabase).
- Notifikacije u aplikaciji: tabela `notifications` (035), RLS: svako čita/briše samo svoje; upis samo iz baze (`notify_user(id, tekst)`, `notify_admins(tekst)`; ručni članovi ih ne dobijaju). Pročitano = obrisano. UI: `components/NotificationBell.jsx` u topbar-u (osvežava na fokus i na 60 s).
- Masovna obaveštenja (038): `admin_announce_month(period)`, `admin_announce_event(id)` (jednom, `events.announced_at`); odjava `/odjava/:token` → `set_email_opt_out`. Vidi `docs/mejlovi.md`.
- Ton mejlova: „ti“ (kao u aplikaciji). Vlasnica se u porukama potpisuje nadimkom iz profila (Maja).

## Odloženo / na redu
- PWA push obaveštenja (opciono; zvonce i mejlovi postoje).
- Opciono Supabase Realtime.
