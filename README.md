# BenSync

BenSync is a bundled employee benefits program for small and mid-sized
employers, delivered through independent broker partners.

This repo contains the whole platform:

- **Marketing site** (`marketing/`): static pages served at the site root
  (/, /employers, /brokers, /members, /whats-included, /partner-network,
  /system, /contact, /login).
- **Platform** (`server/` + `client/` + `shared/`): Express + TypeScript API,
  React portal (sign in at `/portal`), census upload, rate engine, risk
  screen, proposal PDFs, and the admin cockpit. PostgreSQL via Drizzle ORM.
- **Rate engine inputs**: the actuary's workbook, stored split in
  `rater-parts/` and reassembled to `Kennion Actuarial Rater.xlsm` at
  install/build time by `script/assemble-rater.mjs` (the filename is
  load-bearing, referenced by `server/xlsm-rate-engine.ts`), plus
  `server/factor-tables.json`.
- **Design source** (`project/`, `chats/`): the original marketing design
  handoff bundle. See `project/HANDOFF-README.md`.

## Run

```bash
npm install
npm run dev      # development
npm run build    # production build
npm run start    # serve production build
```

Deployed on Railway (nixpacks; see `railway.toml` and `nixpacks.toml`,
which installs LibreOffice + Python UNO for xlsm-based rating).

## Environment

`DATABASE_URL` (Postgres), `SESSION_SECRET`, `RESEND_API_KEY`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (or legacy `CLAUDE`),
`APP_URL` (public origin, e.g. https://bensync.com), optional `PORT`.
