# Mejlovi aplikacije

## Kako radi
1. Trigger u bazi upisuje mejl u red `public.email_outbox` (`enqueue_email(to, kind, payload)`). Iz browsera se ništa ne šalje.
2. `pg_cron` svakog minuta poziva `kick_email_sender()`. Ako u redu ima mejlova, ona preko `pg_net` pozove Edge funkciju `send-emails`.
3. Edge funkcija (`supabase/functions/send-emails/index.ts`) uzme do 20 mejlova (`claim_emails`), napravi HTML po zajedničkom šablonu i pošalje ih preko Resend-a. Rezultat upisuje sa `finish_email`.
   - Neuspeh: novi pokušaj sledećeg minuta, posle 5 pokušaja status `failed` (greška u `last_error`).
   - Dnevni limit 95 (Resend free = 100/dan). Ostatak čeka sutra.
   - Poslati mejlovi se brišu posle 30 dana.

Mejlovi za potvrdu emaila i reset lozinke šalje Supabase Auth (SMTP Resend, šabloni u `supabase/email-templates/`).

## Vrste mejlova
| kind | Kada | Ko dobija |
|---|---|---|
| `email_verified` | email potvrđen (sam ili ručno) | član |
| `signup_created` | član se sam prijavio na jogu/događaj (i pri registraciji sa grupom) | član, sa IPS QR |
| `signup_added` | vlasnica dodala člana | član (i ručni), sa IPS QR |
| `oneonone_received` | novi upit za 1 na 1 | podnosilac (gost ili član), link za status |
| `oneonone_scheduled` | vlasnica zakazala termin | podnosilac, termin + cena + IPS QR |
| `oneonone_rescheduled` | promenjen termin | podnosilac (IPS QR ako nije plaćeno) |
| `oneonone_paid` | potvrđena uplata | samo gost (član dobija notifikaciju) |
| `oneonone_cancelled` | vlasnica otkazala | podnosilac |

IPS QR se šalje kao ugrađena slika (`cid:ips-qr`, Resend inline attachment).

## Notifikacije (036)
- član se prijavi → član „Uspešna prijava: …“, vlasnica „IME – nova prijava: …“
- vlasnica doda → član „Maja te je dodala u …“, vlasnica „Dodala si IME u …“
- potvrđena uplata → član „Uplata za … je potvrđena.“
- član otkaže → vlasnica „IME – otkazana prijava: …“ (kad vlasnica ukloni — ništa)

## Nova vrsta mejla
- U Edge funkciji dodati šablon u `templates` (ključ = `kind`), pa ponovo deploy funkcije (Dashboard → Edge Functions → send-emails → Code → Deploy).
- U migraciji pozvati `enqueue_email(email, 'kind', jsonb_build_object(...))` iz triggera.

## Podešavanje (jednom)
- Edge Functions → Secrets: `RESEND_API_KEY` (Resend ključ `app-emails`), `CRON_SECRET` (nasumičan niz, 40+ znakova).
- Edge funkcija `send-emails` deploy-ovana iz Dashboard editora, **Verify JWT isključen** (štiti je `CRON_SECRET`).
- Vault tajne (SQL editor):
  ```sql
  select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/send-emails', 'email_function_url');
  select vault.create_secret('<CRON_SECRET>', 'email_cron_secret');
  ```

## Provera
```sql
select id, to_email, kind, status, attempts, last_error, created_at, sent_at
from email_outbox order by id desc limit 20;
```
