# Yapindo Backend Test - Task Management API

## Tech Stack
- Node.js + Express.js
- TypeScript
- Prisma ORM
- MySQL
- JWT Authentication
- Redis Cache
- Gemini API (AI Command & AI Query)

---

## Features

### Authentication
- Register user (POST /api/register)
- Login user — JWT (POST /api/login)
- Get Profile (GET /api/profile)
- Role-based access (ADMIN / USER)

---

### Project Management (Admin Only untuk CUD, User+Admin untuk Read)
- Create project (POST /api/projects)
- Get all projects — cached Redis (GET /api/projects)
- Get project by ID (GET /api/projects/:id)
- Update project (PUT /api/projects/:id)
- Delete project (DELETE /api/projects/:id)

---

### Task Management
- Create task — Admin (POST /api/tasks)
- Get all tasks (GET /api/tasks)
- Get task by ID (GET /api/tasks/:id)
- Update task status (PUT /api/tasks/:id)
- Delete task (DELETE /api/tasks/:id)
- View tasks by project (GET /api/projects/:id/tasks)

---

### AI Command System
Endpoint: `POST /api/ai/command`

Fitur:
- Convert natural language → structured JSON
- Execute multiple DB operations (CREATE_TASK, UPDATE_TASK, DELETE_TASK)
- Uses Prisma Transaction (atomic operation)
- Rollback jika salah satu gagal
- Anti manipulation untuk User/Admin table
- Fallback engine jika Gemini API gagal
- Audit logging setiap pemanggilan

Contoh:
```json
{
  "prompt": "Tolong buatkan task baru di project ID 6 dengan judul 'Fix Login Bug', assign ke user ID 3. Terus sekalian ubah status task ID 4 jadi 'done'."
}
```

---

### AI Query System (Update Task 2)
Endpoint: `POST /api/ai/query` (optional: `?stream=true`)

Fitur:
- **Query project dengan prioritas HIGH** — menampilkan project mana saja yang punya task prioritas high
- **Query project user tertentu** — menampilkan project apa saja yang dikerjakan oleh user tertentu
- Output: JSON (default) atau **SSE Stream Response** (`?stream=true`)
- Data berasal dari query database aktual, bukan jawaban karangan AI
- Audit logging setiap query

Contoh prompt:
```json
{ "prompt": "Saat ini project apa saja yang prioritasnya sedang high?" }
```
```json
{ "prompt": "User Akbar Ahmad saat ini sedang mengerjakan project apa?" }
```

---

### Audit Log
- Get all audit logs — Admin only (GET /api/audit-logs)
- Mencatat semua operasi AI (command & query)
- Mencatat status success/failed + failed reason

---

## Database Design

- **User** (id, name, email, password, role)
- **Project** (id, name, description, created_by)
- **Task** (id, project_id, title, description, status, priority, assignee_id)
- **AuditLog** (id, user_id, action, request_payload, response_payload, status, failed_reason, created_at)

---

## Setup Project

### 1. Clone repository
```bash
git clone <repo-url>
cd yapindo-test
```

### 2. Install dependency
```bash
npm install
```

### 3. Setup .env
Salin `.env.example` dan sesuaikan:
```
DATABASE_URL=mysql://root:@localhost:3307/yapindo_db
JWT_SECRET=your_secret
GEMINI_API_KEY=your_gemini_api_key
```

### 4. Prisma setup
```bash
npx prisma generate
npx prisma migrate dev
```

### 5. Run seeder
```bash
npx prisma db seed
```

### 6. Pastikan Redis berjalan
```bash
redis-server
```

### 7. Run server
```bash
npm run dev
```
Server berjalan di `http://localhost:3000`

---

## Seeder Data

| Model   | Data |
|---------|------|
| User    | Admin Yapindo (admin@mail.com), Akbar Ahmad (akbar@yapindo.com), Rizky Ramadhan (rizky@mail.com) |
| Project | Project Utama Yapindo (ID 6), E-Commerce System (ID 2) |
| Task    | Setup Backend (HIGH, IN_PROGRESS), Optimasi Redis (MEDIUM, TODO) |

Password semua user: `Password123!`

---

## Desain Prompt AI

### System Prompt
AI diinstruksikan untuk mengkonversi natural language menjadi JSON array of actions:
- 5 action types: `CREATE_TASK`, `UPDATE_TASK`, `DELETE_TASK`, `QUERY_HIGH_PRIORITY_PROJECTS`, `QUERY_USER_PROJECTS`
- Dilarang keras menghasilkan aksi modifikasi tabel User
- Output harus valid JSON format `{ "actions": [...] }`

### Fallback Engine
Jika Gemini API gagal (timeout, quota, error), sistem menggunakan fallback engine lokal yang:
- Mendeteksi keyword Bahasa Indonesia & Inggris
- Mem-parsing intent dari prompt secara deterministik
- Menghasilkan action yang sama seperti output AI

### Security
- Forbidden keyword check (`USER`, `ADMIN`, `AUTH`, `ROLE`, `PASSWORD`)
- Safe JSON parsing dengan try-catch berlapis
- Tidak pernah crash — selalu return error 400 dengan pesan yang jelas

---

## API Testing (Postman)
Import file berikut ke Postman:
- `collection.json` — Semua endpoint API
- `environment.json` — Variable `base_url` dan `token`

Folder dalam collection:
- **Auth**: Register, Login, Profile
- **Project**: CRUD lengkap
- **Task**: CRUD lengkap
- **AI**: Command, Query (JSON & Stream), Forbidden test
- **Audit Log**: Admin only

---

## Author
Backend Developer Candidate
