# Build spec — Cafe staff attendance (Next.js + Supabase)

You are implementing a staff sign-in/sign-out system for a single cafe (~10 staff).
The Next.js project already exists — put the code into it. Supabase is already set up;
create the schema via a migration.

**Attached: `cafe-attendance.jsx`** — a working single-file prototype of this exact system.
It is the source of truth for the domain logic and the UI. Read it before writing anything.
Its engine functions are already pure and DOM-free — port them, don't reinvent them.

---

## 1. What this thing does

A tablet by the pass displays a QR code that **rotates every 60 seconds**. Staff scan it
with their own phone, enter a 4-digit PIN, and that punches them in — or out, if they
already have an open session. A manager screen edits staff, shifts and timesheets.

Three product decisions already made, do not change them:

1. **Staff scan the tablet's rotating code with their phone.** Not the reverse.
2. **Punching outside a scheduled shift is allowed**, and flagged: `on-time`, `late`,
   `early`, `left-early`, `overtime`, `unscheduled`. Never blocked.
3. **Unlimited in/out sessions per day.** One session = one in + one out pair. No break
   tracking as a separate concept — someone leaving for lunch just punches out and back in.

---

## 2. Non-negotiable security changes from the prototype

The prototype is client-only, so it does things that must not survive the port. These
are the whole reason this is a server app:

- **The token secret never reaches the browser.** In the prototype the phone generates
  *and* validates the code. In production, validation happens only in a server route
  using a secret from env. The phone posts the scanned string; the server decides.
- **The server's clock is the only clock.** Never trust a timestamp sent by a client —
  otherwise staff punch in "on time" by changing their phone's time. Every `now` used in
  a punch decision comes from the server.
- **PINs are stored as bcrypt hashes**, never plaintext. Remove `demoMode` and every
  place that renders a PIN.
- **Rate-limit PIN attempts.** Four digits is 10,000 combinations. Cap at 5 failures per
  staff-guess per minute per IP; on lockout return a generic failure.
- **Swap FNV for HMAC.** The prototype's `tokenForWindow` uses an FNV-1a hash because it
  had to run in a browser with no secret. Server-side, use
  `crypto.createHmac('sha256', SECRET).update(String(windowIndex))` and base32-encode the
  first 50 bits to keep the same 10-character human-typeable code shape.
- **The kiosk page needs its own credential.** Otherwise anyone who opens the URL can
  display valid codes from home. A long random device token in the URL
  (`/kiosk?device=<token>`) checked server-side is sufficient at this size.
- **Never expose the service-role key to the client.** Server routes only.

---

## 3. Schema

Single-tenant, but keep a `site_id` column so a second location doesn't need a rewrite.

```sql
create table staff (
  id uuid primary key default gen_random_uuid(),
  site_id text not null default 'CAFE01',
  name text not null,
  role text default 'Barista',
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,          -- if <= start_time, shift crosses midnight
  created_at timestamptz not null default now()
);
create index shifts_staff_date on shifts (staff_id, date);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,              -- the day the session STARTED (see §5)
  in_at timestamptz not null,
  out_at timestamptz,
  in_flag text not null,
  out_flag text,
  shift_id uuid references shifts(id) on delete set null,
  edited_by text,                  -- set when a manager corrects an entry
  created_at timestamptz not null default now()
);
create index sessions_staff_date on sessions (staff_id, date);

-- At most one open session per staff member. This is the integrity guarantee the
-- whole state machine rests on — enforce it in the database, not just in code.
create unique index sessions_one_open on sessions (staff_id) where out_at is null;

create table settings (
  site_id text primary key default 'CAFE01',
  cafe_name text not null default 'The Corner Cafe',
  grace_min int not null default 5,
  round_step int not null default 1,
  cooldown_sec int not null default 60,
  token_period_ms int not null default 60000,
  timezone text not null default 'Europe/London'
);
```

**RLS:** enable on all four tables, default deny. Manager reads/writes go through an
authenticated Supabase Auth session. The punch route uses the service key server-side and
bypasses RLS deliberately — staff have no Supabase accounts.

---

## 4. Auth model

- **Manager:** one real Supabase Auth account (email + password). Gates `/admin` and
  `/roster` editing via middleware.
- **Staff:** no accounts. Their credential is *the rotating code* (proves presence in the
  cafe) plus *their PIN* (proves identity). Both are checked in one server route.
- **Kiosk:** device token in the URL, validated server-side.

---

## 5. Domain rules that are easy to get wrong

Port these exactly — the prototype has passing tests for every one:

- **Overnight shifts.** `end_time <= start_time` means the shift crosses midnight; add 24h
  to the end. A 22:00–06:00 shift is 8 hours, not −16.
- **Overnight sessions are credited to the day they started.** Someone punching in at
  22:00 Tuesday and out at 06:00 Wednesday puts 8h on Tuesday.
- **Shift matching looks at today *and* yesterday.** Otherwise a 02:00 punch-out can't
  find the 22:00 shift it belongs to.
- **Grace applies to both ends.** Within ±grace of the scheduled start is `on-time`;
  before is `early`, after is `late`. Same logic at the end for `left-early`/`overtime`.
- **Token grace window.** Accept the current window ±1 — walking to the tablet takes a
  moment and device clocks drift. More than that is `expired`.
- **Cooldown covers both directions.** It blocks a double-scan into an open session *and*
  an instant re-punch right after signing out.
- **Weeks are Monday–Sunday.**
- **Rounding is applied at display and export time**, never to the stored timestamps.
- **Sessions open longer than 12 hours** are flagged "missed out" in the manager view,
  not silently counted. Manager can correct the out-time.

---

## 6. Structure

```
lib/attendance.ts     Ported pure engine — no DOM, no Supabase, no Date.now() inside.
                      Every function takes `now` as an argument so it stays testable.
                      Port: shiftWindow, weekDates, nearestShift, flagIn, flagOut,
                      punch, sessionMinutes, totalsFor, rosterWeek, timesheetCSV, hhmm.
lib/token.ts          HMAC token generation + validation. Server-only. Never imported
                      by a client component.
lib/supabase/         server client (service key) and browser client (anon key).

app/kiosk/            Tablet display. Rotating QR + typed fallback code + live floor list.
app/punch/            Staff phone flow: scan or type code -> PIN -> result card.
app/roster/           Mon-Sun grid, read-only unless manager is signed in.
app/admin/            Staff CRUD, timesheet with corrections, settings, CSV export.
app/api/kiosk-code/   GET  -> current payload + code + ms until rotation. Device-gated.
app/api/punch/        POST -> the only write path for staff. See contract below.
app/api/admin/*       Manager CRUD. Auth-gated by middleware.
```

**QR rendering:** the prototype contains a complete, verified QR encoder (byte mode,
versions 1–15, ECC L/M). It was checked bit-for-bit against a reference implementation
across all 320 version/mask combinations and decoded back with a real scanner. Port it as
`lib/qr.ts` rather than adding a dependency — and keep the comment explaining why mask 3
is excluded (its diagonal stripes defeat some camera detectors; any other mask produces an
equally conformant symbol).

**Scanning:** `BarcodeDetector` where available, with the typed 10-character code as the
fallback path. The fallback is not optional — plenty of phones will land on it.

---

## 7. The punch route contract

```
POST /api/punch
body: { code: string, pin: string }

Server steps, in this order:
  1. now = Date.now() on the server.
  2. Validate `code` against HMAC for windowIndex(now) ± 1. Fail -> 200 { ok:false,
     reason:'expired' | 'bad-token' | 'wrong-site' | 'unreadable' }.
  3. Rate-limit check on IP. Exceeded -> 429.
  4. Look up active staff, compare bcrypt(pin). No match -> 200 { ok:false,
     reason:'bad-pin' }. Do not reveal whether the PIN exists.
  5. Load that staff member's open session + their shifts for today and yesterday.
  6. Run the ported `punch()` engine function with the server's `now`.
  7. Write the insert or update inside a transaction.
  8. Return { ok:true, action:'in'|'out', name, at, flag, todayMinutes, weekMinutes }.

Failure responses are always HTTP 200 with ok:false so the UI can render a friendly
message. Reserve non-200 for genuine faults and rate limiting.
```

Every failure reason needs a human message, not a code — see the prototype's `acceptCode`
for the wording ("That code has expired. Look at the tablet for the current one.").

---

## 8. Design

Port the prototype's visual language rather than restyling: dark navy ground, brass
accent, monospace for all times and codes, receipt-ticket treatment for the kiosk QR with
the depleting countdown ring. Keep tabular figures on. Keep the mobile bottom tab bar —
the punch flow is phone-first.

Keep the quality floor already in the prototype: responsive to mobile, visible keyboard
focus, `prefers-reduced-motion` respected, aria-labels on icon-only buttons.

---

## 9. Tests

Port the prototype's 38 engine tests to Vitest against `lib/attendance.ts` — they cover
the state machine, overnight handling, cooldown, flags, rounding, week boundaries and CSV
escaping. Add server-side tests for:

- an expired code is rejected
- a code from another site is rejected
- a forged token with a valid window index is rejected
- a client-supplied timestamp cannot influence the flag
- two concurrent punch requests for the same staff member produce one session, not two
  (the partial unique index should make the second fail — handle it and return a friendly
  result rather than a 500)

Do not mark this done until the tests actually run and pass. Report the real output.

---

## 10. Order of work

1. Migration + RLS policies.
2. `lib/attendance.ts` + ported tests passing. This is the foundation; get it green first.
3. `lib/token.ts` + `lib/qr.ts`.
4. `/api/punch` + its tests.
5. `/kiosk`, then `/punch`.
6. `/roster`.
7. `/admin` + CSV export.

Seed script: 5 staff with known PINs and a week of shifts, for local dev only.
