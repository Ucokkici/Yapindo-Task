# Yapindo Backend Test - Task Management API

## Tech Stack
- Node.js + Express.js
- TypeScript
- Prisma ORM
- MySQL
- JWT Authentication
- Redis Cache
- Gemini API (AI Command)

---

## Features

### Authentication
- Register user
- Login user (JWT)
- Role-based access (ADMIN / USER)

---

### Project Management (Admin Only)
- Create project
- Get all projects (cached with Redis)
- Get project by ID
- Update project
- Delete project

---

### Task Management
- Create task (Admin)
- Get all tasks
- Get task by ID
- Update task status
- Delete task
- View tasks by project

---

### AI Command System
Endpoint:
POST /ai/command

Fitur:
- Convert natural language → structured JSON
- Execute multiple DB operations
- Supports:
  - CREATE_TASK
  - UPDATE_TASK
  - DELETE_TASK
- Uses Prisma Transaction (atomic operation)
- Rollback jika gagal
- Anti manipulation untuk User/Admin table
- Fallback engine jika AI gagal

---

## Database Design

- User (id, name, email, password, role)
- Project (id, name, description, created_by)
- Task (id, project_id, title, description, status, priority, assignee_id)
- AuditLog (id, user_id, action, request_payload, response_payload, status, created_at)

---

## Setup Project

### 1. Install dependency
npm install

### 2. Setup .env
DATABASE_URL=mysql://root:@localhost:3307/yapindo_db
JWT_SECRET=your_secret
GEMINI_API_KEY=your_key

### 3. Prisma setup
npx prisma generate
npx prisma migrate dev

### 4. Run server
npm run dev

---

## Seeder
npx ts-node prisma/seed.ts

---

## API Testing (Postman)
Import collection:
- Auth
- Project
- Task
- AI Command

---

## Author
Backend Developer Candidate
