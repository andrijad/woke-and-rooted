# Bezbednost — pregled i podešavanja

## Šta je u kodu (audit 2026-10-17 i 2026-10-18)
- RLS na svim tabelama; član vidi samo svoje podatke, vlasnica sve (`is_admin()`).
- Član ne može da menja status/iznos prijave, ulogu, mejl, nadimak, oznake (`protect_profile_*` trigeri, `validate_member_*`).
- SECURITY DEFINER funkcije: `set search_path = public`; administratorske proveravaju `is_admin()`; interne (red za mejlove, notifikacije, pomoćne) nemaju EXECUTE za `anon`/`authenticated`.
- Mejlovi: Edge funkcija zaštićena `CRON_SECRET`-om; sav tekst iz baze se escape-uje, HTML opisa događaja prolazi kroz listu dozvoljenih oznaka.
- Javna forma za 1 na 1: honeypot, limit 3 upita po mejlu na sat i 10 upita gostiju na sat ukupno (041).
- Prijava, registracija i reset lozinke: Cloudflare Turnstile („Nisam robot“), proverava ga Supabase Auth.
- Headeri (`public/_headers`): CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy.
- `npm audit`: 0 ranjivosti (2026-10-18).

## Ručna podešavanja (jednom)

### Cloudflare Turnstile (besplatno)
1. Cloudflare → Turnstile → **Add widget**: ime „Woke & Rooted prijave“, hostname `prijave.wokeandrooted.com`, mode **Managed**.
2. **Site key** → Workers projekat → Settings → Build → Variables and secrets: `VITE_TURNSTILE_SITE_KEY`, pa novi deploy.
3. Proveri da se na /login pojavljuje provera.
4. **Secret key** → Supabase → Authentication → Attack Protection → Enable Captcha protection → Cloudflare Turnstile → nalepi secret → Save.
   Redosled je bitan: prvo 2–3, pa 4 (inače prijava ne radi dok se ne objavi nova verzija).

### Supabase
- Advisors → **Security Advisor**: pokrenuti i proveriti upozorenja.
- Authentication → Sign In / Providers → Email: minimalna dužina lozinke 8, „Password requirements“: mala i velika slova i brojevi. Anonymous sign-ins isključeni, ostali provajderi isključeni.
- Authentication → Rate Limits: ostaviti podrazumevano (mejlovi po satu ~30).
- Vlasnica: jaka, jedinstvena lozinka (nalog vidi sve podatke članova).

### Cloudflare (domen)
- SSL/TLS → Edge Certificates: **Always Use HTTPS** uključeno, **Minimum TLS 1.2**.
- Security → Bots: **Bot Fight Mode** uključen.
- Web Analytics (opciono isključiti): CSP ga blokira, pa samo pravi poruku u konzoli.
- DNS: posle 2–3 nedelje bez problema sa mejlovima, `_dmarc` promeniti na `v=DMARC1; p=quarantine;`.
