// Prevodi poruke grešaka (Supabase Auth / Postgres) na srpski.
const RULES = [
  [/captcha/i, 'Provera „Nisam robot“ nije uspela. Sačekaj da se završi pa pokušaj ponovo.'],
  [/invalid login credentials/i, 'Pogrešan email ili lozinka.'],
  [/email not confirmed/i, 'Email adresa još nije potvrđena. Klikni na link u mejlu koji smo ti poslali.'],
  [/user already registered|already been registered/i, 'Nalog sa ovim emailom već postoji. Probaj prijavu ili reset lozinke.'],
  [/password should be at least|weak password|password is too weak/i, 'Lozinka je preslaba. Koristi najmanje 8 karaktera, sa malim i velikim slovom i brojem.'],
  [/same password|different from the old/i, 'Nova lozinka mora da se razlikuje od stare.'],
  [/unable to validate email|invalid email|valid email/i, 'Email adresa nije ispravna.'],
  [/rate limit|too many requests|security purposes|over_email_send_rate_limit|rate_limit/i, 'Previše pokušaja. Sačekaj malo pa pokušaj ponovo.'],
  [/signups? not allowed|signup is disabled/i, 'Registracija trenutno nije moguća.'],
  [/jwt expired|session.*(expired|missing)|not authenticated|auth session missing/i, 'Sesija je istekla. Prijavi se ponovo.'],
  [/failed to fetch|networkerror|network request failed|load failed/i, 'Nema veze sa serverom. Proveri internet pa pokušaj ponovo.'],
  [/database error saving new user/i, 'Registracija nije uspela. Proveri podatke ili nas kontaktiraj.'],
  [/permission denied|row-level security|violates row-level/i, 'Nemaš dozvolu za ovu radnju.'],
  [/duplicate key|already exists/i, 'Ovaj zapis već postoji.'],
  [/foreign key/i, 'Zapis je povezan sa drugim podacima, pa ne može da se promeni.'],
  [/violates check constraint|invalid input|null value/i, 'Neki podaci nisu ispravni. Proveri unos.']
]

export function errMsg(err, fallback = 'Došlo je do greške. Pokušaj ponovo.') {
  const m = typeof err === 'string' ? err : err?.message
  if (!m) return fallback
  for (const [re, text] of RULES) if (re.test(m)) return text
  // poruke koje su već na srpskom (iz naših SQL funkcija) ostaju
  return /[čćšžđČĆŠŽĐ]|\b(nalog|član|lozink|samo|vlasnic)/i.test(m) ? m : fallback
}
