## Volunteer API (Node.js + Express + MongoDB)

A simple backend for a volunteering platform. It exposes REST endpoints to manage users, volunteer posts, and volunteer requests. Built with Express and MongoDB (Atlas), deployable to Vercel.

- **Live frontend**: [volunteer-auth-e1a75.web.app](https://volunteer-auth-e1a75.web.app)

### Tech Stack

- **Runtime**: Node.js (CommonJS)
- **Framework**: Express
- **Database**: MongoDB (Atlas)
- **Hosting**: Vercel Functions (`vercel.json` included)

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A MongoDB Atlas cluster (or MongoDB URI)

### Environment Variables

Create a `.env` file in the project root with:

```
PORT=3000
DB_USER=yourMongoUser
DB_PASS=yourMongoPassword
```

The MongoDB connection string is constructed as:
`mongodb+srv://${DB_USER}:${DB_PASS}@cluster0.oijxnxr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

If you use a different cluster/host, update `index.js` accordingly.

### Install and Run Locally

```
npm install
node index.js
```

Server starts on `http://localhost:3000` unless `PORT` is set.

### CORS

Allowed origins (see `index.js`):

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:3000`
- `https://volunteer-auth-e1a75.web.app`
- `https://volunteer-auth-e1a75.firebaseapp.com`

---

## API Reference

Base URL examples:

- Local: `http://localhost:3000`
- Vercel: depends on your deployment URL (e.g., `https://<project>.vercel.app`)

All responses are JSON unless otherwise noted. Timestamps are ISO strings.

### Health

- GET `/` → `"Volunteer API running"`

### Users

- POST `/users`

  - Upserts a user by `email`.
  - Body:
    ```json
    {
      "name": "John Doe",
      "email": "john@example.com", // required
      "photo": "https://...",
      "bio": "Short bio",
      "authProvider": "google",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
    ```
  - 201 when created, 200 when updated.
  - Errors: 400 (missing email), 409 (duplicate), 500.

- GET `/users/:email`
  - Returns a user without `_id`.
  - Errors: 404 (not found), 500.

### Posts

- POST `/posts`

  - Creates a volunteer post.
  - Required: `title`, `description`, `category`, `location`, `needed` (number > 0), `deadline` (ISO), `organizerEmail`.
  - Body example:
    ```json
    {
      "thumbnail": "https://...",
      "title": "Beach Cleanup",
      "description": "Help clean beach area",
      "category": "Environment",
      "location": "Miami, FL",
      "needed": 10,
      "deadline": "2025-12-31T00:00:00.000Z",
      "organizerName": "ACME Org",
      "organizerEmail": "org@example.com"
    }
    ```
  - Response: 201 with `{ insertedId, post }`.
  - Errors: 400/401/500.

- GET `/posts`

  - Query params:
    - `organizerEmail` (string): filter by organizer.
    - `upcoming=1`: only posts with deadlines >= today.
    - `limit` (number): default up to 100.
  - Sorted by `deadline` when `upcoming=1`, otherwise by `createdAt` desc.

- GET `/posts/:id`

  - Returns a post by ObjectId string. Adds `id` field as string.
  - Errors: 404/500.

- PUT `/posts/:id`

  - Updates allowed fields only: `thumbnail`, `title`, `description`, `category`, `location`, `needed`, `deadline`, `status`.
  - Automatically sets `updatedAt`.
  - Errors: 400 (no valid fields/invalid id), 404, 500.

- DELETE `/posts/:id`
  - Deletes a post by id.
  - Errors: 400, 404, 500.

### Requests (volunteer sign-ups)

- POST `/requests`

  - Creates a volunteer request for a post and safely decrements the post's `needed` count using a CAS-like update.
  - Required: `postId` (ObjectId string), `volunteerEmail`.
  - Optional: `volunteerName`, `suggestion`, `status` (default `requested`).
  - Business rules:
    - Post must exist, be `status: "open"`, and not past `deadline` (end-of-day allowed).
    - If duplicate (same `postId` + `volunteerEmail`) insert is attempted, returns 409.
    - When `needed` reaches 0, post is auto-closed.
  - Errors: 400/401/404/409/500.

- GET `/requests?volunteerEmail=you@example.com`

  - Lists requests; when `volunteerEmail` provided, filters by that user.
  - Returns `id` as string for convenience.

- DELETE `/requests/:id`
  - Cancels a request and increments the associated post's `needed` by 1.
  - Errors: 400/404/500.

---

## Data and Indexes

On startup, the app ensures helpful indexes:

- `users`: `{ email: 1 }` unique
- `posts`: `{ createdAt: -1 }`, `{ organizerEmail: 1 }`, `{ deadline: 1 }`
- `requests`: `{ postId: 1, volunteerEmail: 1 }` unique, `{ createdAt: -1 }`

Collections are created lazily in database `volunteerDB`:

- `users`, `posts`, `requests`

---

## Deployment (Vercel)

- `vercel.json` is configured to run `index.js` as a serverless function and route all HTTP methods to it.
- Set environment variables (`DB_USER`, `DB_PASS`, `PORT` optional) in Vercel Project Settings.
- After deploy, use the Vercel URL as your API base.

---

## Notes & Caveats

- Authentication/authorization is not enforced at the API layer. The frontend should pass the authenticated `email` and the server trusts it. For production, add proper auth (JWT/session) and server-side verification.
- Dates should be provided as ISO strings; deadlines are compared with end-of-day semantics on the server.
- The API normalizes Mongo `_id` to `id` (string) in various list responses for frontend convenience.

---
