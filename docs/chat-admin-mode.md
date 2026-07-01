# Chat Admin Mode

## Global Chat Mode

Global Chat Mode is stored in the single `ChatSetting` document and controls the default behavior for chat sessions whose `modeSource` is `GLOBAL`.

- `AI_AUTO`: user messages trigger the existing Gemini/AI response flow.
- `MANUAL`: user messages are stored, Gemini/AI is not called, and the session waits for admin reply.

Admin APIs:

- `GET /api/admin/chat/settings`
- `PATCH /api/admin/chat/settings` with `{ "mode": "AI_AUTO" }` or `{ "mode": "MANUAL" }`

Changing the global setting does not change sessions with `modeSource = "SESSION"`.

## Session Override Mode

Each `ChatSession` has:

- `mode`: `AI_AUTO` or `MANUAL`
- `modeSource`: `GLOBAL` or `SESSION`
- `effectiveMode`: returned by APIs so FE does not need to guess

When `modeSource = "GLOBAL"`, `effectiveMode` comes from `ChatSetting.mode`.
When `modeSource = "SESSION"`, `effectiveMode` comes from `ChatSession.mode`.

## User Chat Flow In AI_AUTO

`POST /api/chat/sessions/:sessionId/messages`

1. Backend checks the session belongs to the current user.
2. Backend stores the user message with `senderType = "USER"`.
3. Backend calculates `effectiveMode`.
4. If `effectiveMode = "AI_AUTO"`, backend calls the existing Gemini/AI flow.
5. Backend stores the AI message with `senderType = "AI"`.
6. Backend returns `userMessage`, `aiMessage`, `mode`, `modeSource`, `effectiveMode`, and `status = "active"`.

FE should show the user message and AI message immediately. It can show a label such as "AI Mentor dang tra loi tu dong".

## User Chat Flow In MANUAL

`POST /api/chat/sessions/:sessionId/messages`

1. Backend stores the user message with `senderType = "USER"`.
2. Backend calculates `effectiveMode`.
3. If `effectiveMode = "MANUAL"`, backend does not call Gemini/AI.
4. Backend sets `status = "waiting_admin"` and `unreadByAdmin = true`.
5. Backend returns `adminMessage = null`, `effectiveMode = "MANUAL"`, and a manual waiting message.

FE should show the user message, not wait for AI, and show "Dang cho admin tra loi". User can continue sending messages if the backend allows it.

## Admin Switches One Session From AI To MANUAL

`PATCH /api/admin/chat/sessions/:sessionId/mode`

Body:

```json
{
  "mode": "MANUAL",
  "reason": "Admin can ho tro truc tiep user nay"
}
```

Backend sets:

- `mode = "MANUAL"`
- `modeSource = "SESSION"`
- `status = "waiting_admin"`
- `assignedAdminId = current admin id`
- `aiPausedAt = now`
- `aiPausedBy = current admin id`
- `manualReason = reason`

Old AI messages remain unchanged. From the next user message in that session, AI will not reply automatically.

## Admin Switches One Session From MANUAL To AI_AUTO

`PATCH /api/admin/chat/sessions/:sessionId/mode`

Body:

```json
{
  "mode": "AI_AUTO"
}
```

Backend sets:

- `mode = "AI_AUTO"`
- `modeSource = "SESSION"`
- `status = "active"`
- clears `assignedAdminId`, `aiPausedAt`, `aiPausedBy`, and `manualReason`

Old messages remain unchanged. From the next user message, Gemini/AI can reply again.

## Use Global Mode Again

`PATCH /api/admin/chat/sessions/:sessionId/use-global-mode`

Backend sets `modeSource = "GLOBAL"` and returns the current `effectiveMode` from `ChatSetting.mode`.

## Admin Session Management APIs

- `GET /api/admin/chat/sessions`
  - Filters: `status`, `userId`, `mode`, `modeSource`, `assignedAdminId`, `page`, `limit`
  - Returns user info, last message, status, mode, modeSource, effectiveMode, assigned admin, unread flags, timestamps, and `lastMessageAt`.
- `GET /api/admin/chat/sessions/:sessionId`
  - Returns session detail, user info, and messages in ascending time order.
- `POST /api/admin/chat/sessions/:sessionId/messages`
  - Body: `{ "content": "..." }`
  - Stores a message with `senderType = "ADMIN"` and `senderId = current admin id`.
  - Sets the session to `MANUAL`, `modeSource = "SESSION"`, `status = "answered"`, `unreadByUser = true`, and `unreadByAdmin = false`.

Admin can reply immediately after a user, AI, or admin message. Old AI messages are never deleted and remain visible with `senderType = "AI"`.

## FE Handling

User chat screen should branch on `response.effectiveMode`:

- `AI_AUTO`: append `userMessage` and `aiMessage`.
- `MANUAL`: append `userMessage`, do not wait for AI, show waiting-admin state.

Admin chat screen should:

- Show global Chat Settings with `AI_AUTO` and `MANUAL`.
- Show Chat Sessions list with filters.
- Allow switching a session to manual mode.
- Allow switching a session back to AI auto mode.
- Allow returning a session to global mode.
- Show `senderType = "USER"`, `senderType = "AI"`, and `senderType = "ADMIN"` distinctly.
- Allow admin manual reply from the session detail screen.
