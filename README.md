# 🗓️ Planningas

Full-stack planavimo aplikacija.

## Tech stack

| Dalis | Technologija |
|-------|-------------|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite (portas 5174) |
| Backend | Node.js + Express + TypeScript (portas 3002) |
| DB | SQLite lokaliai (Prisma ORM) — produkcijai keisti į PostgreSQL |
| Auth | JWT + bcryptjs |

## Paleidimas

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev          # http://localhost:3002

# Frontend (kitame terminale)
cd frontend
npm install
npm run dev          # http://localhost:5174
```

Vite dev serveris proxina `/api` į backend'ą — CORS lokaliai nekliudo.

## Struktūra

```
Planningas/
├── backend/
│   ├── prisma/schema.prisma   # DB schema (User)
│   └── src/
│       ├── index.ts           # Express serveris
│       ├── lib/prisma.ts
│       ├── middleware/auth.ts # JWT middleware
│       └── routes/auth.ts     # register / login
└── frontend/
    └── src/
        ├── App.tsx            # Route'ai + auth guard
        ├── hooks/useAuth.ts
        ├── services/api.ts    # Axios klientas su JWT
        └── pages/             # Login, Home
```
