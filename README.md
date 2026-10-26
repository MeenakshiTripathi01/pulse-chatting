# Pulse Chat

A real-time, one-to-one chat application built with **React, Express, MongoDB and Socket.IO**.
Users register, find each other in a searchable directory, start private conversations and
exchange messages that are delivered live and stored permanently.

## Features

- **Authentication**: register / log in / log out with bcrypt-hashed passwords and a JWT stored
  in an `HttpOnly` cookie. Sessions survive page refreshes. CSRF protection for state-changing
  requests and rate limits on login and registration.
- **User directory**: searchable list of other users (name or email).
- **Private conversations**: one conversation per pair of users, enforced by a unique index.
- **Real-time messaging**: Socket.IO with server-side room authorization. A message is shown
  as sent only after MongoDB has saved it (acknowledgements).
- **Reliable delivery**: client-generated message ids make retries safe (no duplicates);
  failed sends show a Retry button; after a reconnect the app refetches anything it missed.
- **History**: cursor-paginated message history ("Load older messages").
- **Live sidebar**: latest-message previews and ordering update as messages arrive; new
  conversations started by others appear automatically.
- **Responsive, accessible UI**: list/chat navigation on mobile, keyboard support, visible focus
  states, screen-reader labels, and explicit loading, empty, error, and offline states.

Deliberately **not** included (rather than faked): online presence, typing indicators,
read receipts, push notifications.

## Tech stack

| Layer     | Technology                                                      |
| --------- | --------------------------------------------------------------- |
| Frontend  | React 19, Vite 8, React Router 8, Tailwind CSS 4, Axios, Zod    |
| Real-time | Socket.IO 4 (server and client)                                 |
| Backend   | Node.js 24, Express 5, Mongoose 9, Zod, bcrypt, jsonwebtoken    |
| Security  | Helmet, CORS allow-list, express-rate-limit, CSRF tokens        |
| Testing   | Vitest, Supertest, mongodb-memory-server, React Testing Library |
| Tooling   | npm workspaces, oxlint, Prettier, concurrently                  |

## Architecture

```
Browser (React)
  │  REST (Axios, cookies + X-CSRF-Token)      WebSocket (Socket.IO, same cookie)
  ▼                                            ▼
Express app ─ routes → controllers ─┐    Socket.IO ─ auth middleware → handlers ─┐
                                    ▼                                            ▼
                            services/ (all business rules & authorization checks)
                                    ▼
                         Mongoose models → MongoDB
```

REST handles everything request/response shaped (auth, users, conversations, history).
Socket.IO handles sending and receiving live messages. **Both call the same service
functions**, so rules like "you must be a member of this conversation" exist in exactly one
place (`assertConversationMember`).

### Folder structure

```
realtime-chat/
├── package.json            # npm workspaces + root scripts (dev, test, lint, build)
├── render.yaml             # Render deployment blueprint
├── server/
│   ├── .env.example
│   ├── scripts/            # memory-db.js (throwaway local DB), smoke-test.js (end-to-end check)
│   ├── src/
│   │   ├── config/         # env.js (validated configuration), db.js (MongoDB connection)
│   │   ├── models/         # User, Conversation, Message
│   │   ├── validation/     # Zod schemas for bodies, queries, ids and socket payloads
│   │   ├── middleware/     # auth, csrf, validate, rateLimit, errorHandler
│   │   ├── services/       # authService, userService, conversationService, messageService
│   │   ├── controllers/    # thin HTTP handlers
│   │   ├── routes/         # /api/auth, /api/users, /api/conversations
│   │   ├── socket/         # index.js (server + origin check), auth.js, messageHandlers.js, rooms.js
│   │   ├── utils/          # AppError, cookies, serializers
│   │   ├── app.js          # builds the Express app (importable by tests)
│   │   └── server.js       # connects to MongoDB, attaches Socket.IO, listens
│   └── tests/              # API, socket and service tests
└── client/
    ├── .env.example
    ├── vite.config.js      # dev proxy for /api and /socket.io; Vitest config
    └── src/
        ├── api/            # Axios instance (credentials, CSRF) + endpoint functions
        ├── context/        # AuthProvider, SocketProvider
        ├── state/          # chatReducer (pure, unit-tested message/conversation logic)
        ├── hooks/          # useChat, useUserSearch, useFormState
        ├── components/     # ui/, auth/, routing/, chat/
        ├── pages/          # LoginPage, RegisterPage, ChatPage
        ├── lib/            # validation, formatting, socket factory, ids
        └── test/           # component, reducer and API-client tests
```

## Database schema

**User**: `name`, `email` (trimmed, lowercased, **unique index**), `passwordHash`
(`select: false`, so it's never returned unless explicitly requested), timestamps.

**Conversation**: `type` (`"direct"` today, ready for `"group"` later), `participants`
(array of user ids), `directKey` (the two participant ids sorted and joined), `lastMessage`
(denormalized preview: id, sender, content, time), `lastMessageAt`, timestamps.

**Message**: `conversation`, `sender`, `content` (≤ 2000 chars), `clientMessageId`
(optional idempotency key), `createdAt`.

| Index                                                   | Why                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `users.email` unique                                    | Fast login lookup; the database itself rejects duplicate accounts.       |
| `users.name`                                            | Alphabetical user directory.                                             |
| `conversations.directKey` unique (partial)              | Exactly one 1:1 conversation per pair, even if both users click at once. |
| `conversations { participants, lastMessageAt: -1 }`     | "My conversations, newest first" (multikey index on the array).          |
| `messages { conversation, createdAt: -1, _id: -1 }`     | Paginated history; `_id` breaks ties between same-millisecond messages.  |
| `messages { sender, clientMessageId }` unique (partial) | Retried sends can't create duplicate messages.                           |

**Why a denormalized `lastMessage`?** The sidebar needs a preview for every conversation.
Storing a small copy on the conversation turns N+1 queries into one, at the cost of one extra
update per message. The update only moves the preview forward in time, so out-of-order saves
can't make it go backwards.

## Authentication and security design

1. **Passwords** are hashed with bcrypt (cost 12). Passwords over 72 bytes are rejected
   because bcrypt silently ignores anything after byte 72.
2. On register/login the server signs a **JWT** (`HS256`, algorithm pinned on verify) whose
   `sub` is the user id, and sets it as a cookie: `HttpOnly` (JavaScript can't read it, so XSS
   can't steal it), `Secure` in production (HTTPS only), `SameSite=Lax`.
3. Every protected request goes through `requireAuth`, which verifies the token **and** loads
   the user from MongoDB. Controllers only ever use `req.user._id`; user ids sent by the client
   are never trusted for identity.
4. **CSRF**: cookies are sent automatically by browsers, so a malicious site could trigger
   requests. The client fetches a token from `GET /api/auth/csrf` (also stored in an HttpOnly
   cookie) and sends it in an `X-CSRF-Token` header. The server compares header and cookie.
   Other sites can't read the token because CORS blocks them from reading our responses.
5. **Login errors are generic** ("Invalid email or password"), and the server compares against
   a dummy hash for unknown emails, so attackers can't use responses or timing to learn which
   emails are registered. (Registration does say "email already exists"; that trade-off favors
   usability.)
6. **Rate limits**: 20 login/registration attempts per IP per 15 minutes (configurable);
   30 socket messages per 10 seconds per connection.
7. Unknown or unauthorized conversations both return **404**, so ids can't be probed.
8. Helmet sets security headers (including a Content-Security-Policy); request bodies are
   limited to 16 kB; all input is validated with Zod, which also rejects NoSQL operator
   injection like `{"$ne": null}`.

## Socket.IO design

- **Handshake auth:** the browser sends the same session cookie; `socket/auth.js` uses the same
  `getSessionFromToken` as the REST middleware, so both paths behave identically.
- **Origin check:** CORS doesn't apply to WebSocket upgrades, so `allowRequest` rejects
  handshakes from origins that aren't allowed. This prevents cross-site WebSocket hijacking.
- **Rooms are server-controlled:** on connect, the server looks up the user's conversations
  and joins the socket to `conversation:<id>` rooms (plus `user:<id>`). Clients never ask to
  join a room. When a conversation is created over REST, the server joins both users' sockets
  to the new room and emits `conversation:new`.
- **Events**

  | Direction       | Event              | Payload                                                              |
  | --------------- | ------------------ | -------------------------------------------------------------------- |
  | client → server | `message:send`     | `{ conversationId, content, clientMessageId }` + ack callback        |
  | server → client | ack                | `{ ok: true, message }` or `{ ok: false, error: { code, message } }` |
  | server → room   | `message:new`      | `{ message }`                                                        |
  | server → user   | `conversation:new` | `{ conversation }`                                                   |
  | server → socket | `session:ready`    | `{ user }`: rooms joined, safe to resync                             |

- **Delivery guarantees:** the ack is sent only after the message is stored. The client shows
  "Sending…" until then, and "Not sent · Retry" on an error or a 10-second timeout. Retries reuse
  the same `clientMessageId`, so the server returns the original message instead of a copy.
  The client also deduplicates by message id, because the sender receives both the ack and the
  room broadcast.
- **Reconnection:** Socket.IO reconnects automatically with backoff. After each
  `session:ready`, the client refetches conversations and the open thread to fill any gap.
  While disconnected, a banner explains the state and sending is disabled.

## Getting started

### Prerequisites

- **Node.js 22.22+ or 24 LTS** (`node -v`) and npm 10+
- A **MongoDB** database: a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
  (recommended), or a local MongoDB 7+

### 1. Install

```bash
git clone <your-repo-url> realtime-chat
cd realtime-chat
npm install          # installs server and client (npm workspaces)
```

### 2. Configure the server

```bash
cp server/.env.example server/.env      # Windows PowerShell: Copy-Item server/.env.example server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # paste as JWT_SECRET
```

Then set `MONGODB_URI` in `server/.env`.

**MongoDB Atlas setup**

1. Create a free cluster at <https://cloud.mongodb.com>.
2. _Database Access_ → add a database user with a strong password (role: read and write).
3. _Network Access_ → add your current IP address (and later your host's outbound IPs).
4. _Connect_ → _Drivers_ → copy the `mongodb+srv://…` string, insert the password, and add a
   database name before the `?`, e.g. `…mongodb.net/realtime-chat?retryWrites=true&w=majority`.
   URL-encode special characters in the password.

Collections and indexes are created automatically on first start.

> **No database yet?** `npm run db:memory` starts a throwaway MongoDB at
> `mongodb://127.0.0.1:27017` (data is lost when it stops). Set
> `MONGODB_URI=mongodb://127.0.0.1:27017/realtime-chat` while using it.

### 3. Run in development

```bash
npm run dev
```

- Client: <http://localhost:5173> (open this)
- API: <http://localhost:5000> (the Vite dev server proxies `/api` and `/socket.io` to it)

To try real-time messaging, register two users in **two different browsers** (or a normal and
a private window, since each needs its own cookie).

**Optional demo data.** There are no built-in users. Every account is a real registration
stored in MongoDB. For quick local testing, `npm run seed` creates two demo accounts
(`alice@demo.com` and `bob@demo.com`, password `Password123`) and a short conversation in the
database from `MONGODB_URI`. It is safe to run repeatedly, never changes existing accounts, and
refuses to run when `NODE_ENV=production`. Don't seed a shared database whose users you don't
control, because anyone who knows the demo password could log in.

### 4. Test with a second device on the same Wi-Fi (optional)

```bash
npm run dev:lan
```

This runs the same development setup, but Vite listens on your network address and the API
allows that origin. The script prints a URL such as `http://192.168.1.13:5173`. Open it on the
other device (phone or laptop on the **same network**), register a second account, and chat. If
the page doesn't load, allow Node.js through your firewall for _private_ networks. This is plain
HTTP for local testing only. To reach someone outside your network, deploy (see
[Deployment](#deployment)).

## Environment variables

### `server/.env`

| Variable                 | Required | Default                 | Description                                                          |
| ------------------------ | -------- | ----------------------- | -------------------------------------------------------------------- |
| `MONGODB_URI`            | yes      | –                       | MongoDB connection string                                            |
| `JWT_SECRET`             | yes      | –                       | ≥ 32 random characters used to sign tokens                           |
| `NODE_ENV`               | no       | `development`           | `production` enables `Secure` cookies                                |
| `PORT`                   | no       | `5000`                  | HTTP port                                                            |
| `JWT_EXPIRES_IN_SECONDS` | no       | `604800` (7 days)       | Session length                                                       |
| `CLIENT_ORIGIN`          | see note | `http://localhost:5173` | Comma-separated browser origins allowed (CORS + sockets)             |
| `COOKIE_SAME_SITE`       | no       | `lax`                   | `lax`, `strict`, or `none` (cross-site deployments; production only) |
| `TRUST_PROXY`            | no       | `0`                     | Number of reverse proxies (use `1` on Render/Railway/Heroku)         |
| `SERVE_CLIENT`           | no       | `false`                 | `true` = Express also serves `client/dist`                           |
| `AUTH_RATE_LIMIT_MAX`    | no       | `20`                    | Login/register attempts per IP per 15 min                            |

The server validates these on startup and exits with a clear message if something is missing.
In production, at least one origin is required and each must be `https://` (except localhost)
with no path. On Render, the service's public URL (`RENDER_EXTERNAL_URL`, set automatically by
Render) is added to the allowed origins, so `CLIENT_ORIGIN` is only needed for a custom domain.
The allowed origins are printed at startup.

### `client/.env` (optional)

| Variable              | Description                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`        | Only if the API is on a different origin, e.g. `https://api.example.com/api`. Public, never a secret. |
| `VITE_DEV_API_TARGET` | Where the dev proxy forwards (default `http://localhost:5000`).                                       |

## Scripts

| Command (from the repo root) | What it does                                          |
| ---------------------------- | ----------------------------------------------------- |
| `npm run dev`                | Server (auto-restart) and client together             |
| `npm run dev:lan`            | Same, reachable from other devices on your network    |
| `npm run seed`               | Optional demo accounts (development only)             |
| `npm test`                   | All server tests, then all client tests               |
| `npm run lint`               | oxlint for server and client                          |
| `npm run build`              | Production build of the client into `client/dist`     |
| `npm start`                  | Start the server (production)                         |
| `npm run format`             | Prettier                                              |
| `npm run db:memory`          | Throwaway local MongoDB for experiments               |
| `npm run smoke -w server`    | End-to-end check against a running server (see below) |

## Testing

```bash
npm test                 # everything
npm test -w server       # API, socket and service tests
npm test -w client       # component, reducer and API-client tests
```

- **Server tests** run against a real in-memory MongoDB (`mongodb-memory-server`; the first
  run downloads a MongoDB binary). Socket tests start a real HTTP server and connect several
  `socket.io-client` instances as different users. They cover registration and login, duplicate
  emails, protected routes, CSRF, conversation membership, history pagination, real-time
  delivery, empty/invalid messages, duplicate retries, and origin checks. A production-mode
  suite simulates a Render deployment (`Secure` cookies, only the public origin accepted for
  REST and WebSockets, per-IP login rate limiting behind the proxy, seed refusal), and config
  tests cover origin validation.
- **Client tests** use React Testing Library. Only the HTTP layer and the socket are replaced
  with fakes, so routing, state, and components run for real.
- **Smoke test**: with a server running, `npm run smoke -w server` registers two throwaway
  users and checks the whole flow over real HTTP and WebSockets. Configure it with
  `SMOKE_BASE_URL` (default `http://localhost:5000`) and `SMOKE_ORIGIN` (must be an allowed
  origin, default `http://localhost:5173`). Only use it where creating test users is acceptable.

## API reference

All responses are JSON. Errors always look like
`{ "error": { "message": "...", "code": "SOME_CODE", "details": { "field": "..." } } }`.
Every `POST` (including login and register) requires the `X-CSRF-Token` header with a token
from `GET /api/auth/csrf`. Authenticated requests rely on the session cookie, so browser
clients must send credentials (`withCredentials: true`).

| Method | Path                                             | Auth     | Description                                                                                                                       |
| ------ | ------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                                    | –        | `{ status, database }` for uptime checks                                                                                          |
| GET    | `/api/auth/csrf`                                 | –        | `{ csrfToken }` and sets the CSRF cookie                                                                                          |
| POST   | `/api/auth/register`                             | –        | Body `{ name, email, password }` → `201 { user }` + session cookie. `409 EMAIL_TAKEN`, `400 VALIDATION_ERROR`, `429 RATE_LIMITED` |
| POST   | `/api/auth/login`                                | –        | Body `{ email, password }` → `{ user }` + session cookie. `401 INVALID_CREDENTIALS`                                               |
| POST   | `/api/auth/logout`                               | –        | Clears the session cookie → `204`                                                                                                 |
| GET    | `/api/auth/me`                                   | ✔        | `{ user }` for the current session. `401` if missing/expired                                                                      |
| GET    | `/api/users?search=&limit=`                      | ✔        | Other users matching name/email (`limit` 1–50, default 20) → `{ users }`                                                          |
| GET    | `/api/conversations`                             | ✔        | My conversations, newest activity first → `{ conversations }`                                                                     |
| POST   | `/api/conversations`                             | ✔        | Body `{ participantId }` → `201` (created) or `200` (existing) `{ conversation }`                                                 |
| GET    | `/api/conversations/:id`                         | ✔ member | One conversation → `{ conversation }`; `404` if not a member                                                                      |
| GET    | `/api/conversations/:id/messages?before=&limit=` | ✔ member | `{ messages, hasMore, nextCursor }`, oldest→newest; pass `nextCursor` as `before` for older pages (`limit` 1–100, default 30)     |

Example objects:

```json
{ "user": { "id": "66f…", "name": "Ada Lovelace", "email": "ada@example.com" } }

{ "message": { "id": "66f…", "conversationId": "66f…", "senderId": "66f…",
  "content": "Hello!", "clientMessageId": "1b9d…", "createdAt": "2026-10-25T10:00:00.000Z" } }
```

## Deployment

The recommended setup is **one Node web service** that serves the API, Socket.IO, and the built
React app from the same origin. Same-origin means first-party cookies (no third-party cookie
blocking), `SameSite=Lax`, and no cross-origin CORS setup. Any host that supports long-running
Node processes and WebSockets works (Render, Railway, Fly.io, a VPS). Serverless function
platforms don't suit Socket.IO.

### Render (blueprint included)

1. Push the repo to GitHub.
2. In Render: _New → Blueprint_ → select the repo. `render.yaml` defines the build
   (`npm ci --include=dev && npm run build`), start (`npm start`) and health check.
3. Enter `MONGODB_URI` (your Atlas connection string) when prompted. `JWT_SECRET` is
   generated by Render, and the public URL is allowed automatically. Set `CLIENT_ORIGIN` only
   if you add a custom domain.
4. In Atlas _Network Access_, allow Render's outbound IPs (listed in the service's _Connect_
   tab), or `0.0.0.0/0` for a demo, relying on the strong database password.
5. Visit the URL, register two users, and run the smoke test against it if you like:
   `SMOKE_BASE_URL=https://… SMOKE_ORIGIN=https://… npm run smoke -w server`.

Free Render instances sleep when idle; the first request after a pause takes a while.

### Production checklist

- **HTTPS**: required. `NODE_ENV=production` marks cookies `Secure`, so they are only sent over
  HTTPS. Managed hosts provide TLS; behind your own proxy, terminate TLS there and set
  `TRUST_PROXY=1` so rate limiting sees real client IPs.
- **CORS / origins**: allowed origins must exactly match the browser's origin (scheme + host +
  port). They control both CORS and the WebSocket origin check. The server refuses to start in
  production without one, and logs the list at startup.
- **Cookies**: keep `COOKIE_SAME_SITE=lax` for same-origin deployments. Only for a split
  deployment (frontend and API on different sites) use `none`, set the frontend's
  `VITE_API_URL` to the API URL, and list the frontend origin in `CLIENT_ORIGIN`. Note that
  some browsers block third-party cookies, which is why same-origin is recommended.
- **MongoDB**: dedicated database user with least privilege, network access restricted to the
  host where possible, and backups enabled on Atlas.
- **Secrets**: only in the host's environment settings, never in Git or in `VITE_*` variables.
  Rotating `JWT_SECRET` logs everyone out.

## Known limitations

- **Single server instance.** Socket.IO rooms live in memory. Running multiple instances would
  need the Socket.IO Redis adapter (and sticky sessions when long-polling is used).
- **No token revocation.** Logout clears the cookie, but a stolen token stays valid until it
  expires (7 days by default). A token version on the user or short-lived access tokens plus
  refresh tokens would address this.
- A socket that is already connected stays connected after logout in _another_ tab until that
  tab makes a request; sending also stops once the token expires.
- User search uses a case-insensitive regex, which can't use an index efficiently. Fine for
  thousands of users; a text or Atlas Search index would be needed beyond that.
- One-to-one conversations only (the schema has a `type` field to add groups later).
- Messages can't be edited or deleted. There are no attachments, presence, typing indicators,
  read receipts, or notifications.
- Saving a message and updating the conversation preview are two writes, not a transaction.
  If the second fails, the message is kept and the preview catches up with the next message.
- Each user's email is visible to other signed-in users in the directory.
