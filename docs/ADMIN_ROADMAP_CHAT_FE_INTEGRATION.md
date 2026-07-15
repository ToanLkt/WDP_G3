# Admin Roadmap Progress

## 1. Muc tieu thay doi

Truoc day Admin Roadmap tra raw `Roadmap` document va chu yeu dua vao `Roadmap.progressSummary`, nen Admin khong xem duoc task-level learning progress cua user. Hanh vi moi:

- Admin roadmap list tra contract da normalize va co `progressSummary.pendingItems`.
- Admin roadmap detail query dung `RoadmapProgress` theo `roadmapId + owner userId`.
- Detail merge `RoadmapProgress.items` voi task metadata trong `Roadmap` de co du title, description, week, phase, estimatedHours va status.
- User roadmap API khong bi doi contract.

## 2. API da thay doi

- Method: `GET`
- Path: `/api/admin/roadmaps`
- Query params: `page`, `limit`, `search`, `status`, `includeDeleted`
- Quyen truy cap: authenticated admin
- List tra: roadmap contract nen tang, user summary, repository summary, `progressSummary`. Khong tra full `learningProgress` de tranh payload nang.

- Method: `GET`
- Path: `/api/admin/roadmaps/{roadmapId}`
- Query params: `includeDeleted`
- Quyen truy cap: authenticated admin
- Detail tra: roadmap contract nen tang, user summary, repository summary, `roadmapSource` da attach snapshot provenance, `progressSummary`, va full `learningProgress`.

`includeDeleted` mac dinh `false`. Khi `true`, Admin co the xem soft-deleted roadmap trong list/detail.

## 3. Response contract moi

### GET /api/admin/roadmaps

```json
{
  "success": true,
  "message": "Roadmaps fetched successfully",
  "data": {
    "items": [
      {
        "roadmapId": "665f1f000000000000000001",
        "title": "Backend Developer Roadmap",
        "targetRole": "Backend Developer",
        "roleId": "backend",
        "requestedLevel": "beginner",
        "effectiveLevel": "beginner",
        "durationWeeks": 6,
        "language": "vi",
        "status": "active",
        "isDeleted": false,
        "deletedAt": null,
        "deletedBy": null,
        "user": {
          "id": "665f1f000000000000000010",
          "name": "Nguyen Van A",
          "displayName": "Nguyen Van A",
          "email": "student@example.com",
          "avatar": "",
          "status": "active",
          "role": "student"
        },
        "repository": {
          "id": "665f1f000000000000000020",
          "name": "api-project",
          "fullName": "student/api-project",
          "htmlUrl": "https://github.com/student/api-project",
          "language": "JavaScript"
        },
        "roadmapSource": {
          "type": "user_contribution_analysis",
          "sourceMode": "single_repo",
          "analysisId": "665f1f000000000000000030",
          "snapshotId": "665f1f000000000000000031"
        },
        "roleMatch": {},
        "skillGapSummary": [],
        "mainRoadmap": {
          "title": "Backend Developer Roadmap",
          "targetRole": "Backend Developer",
          "reason": "",
          "phases": []
        },
        "alternativeRoadmaps": [],
        "progressSummary": {
          "totalItems": 12,
          "completedItems": 4,
          "inProgressItems": 2,
          "pendingItems": 6,
          "overallProgress": 33
        },
        "createdAt": "2026-07-15T00:00:00.000Z",
        "updatedAt": "2026-07-15T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "errorCode": null
}
```

### GET /api/admin/roadmaps/{roadmapId}

```json
{
  "success": true,
  "message": "Roadmap fetched successfully",
  "data": {
    "roadmap": {
      "roadmapId": "665f1f000000000000000001",
      "title": "Backend Developer Roadmap",
      "targetRole": "Backend Developer",
      "roleId": "backend",
      "requestedLevel": "beginner",
      "effectiveLevel": "beginner",
      "durationWeeks": 6,
      "status": "active",
      "user": {
        "id": "665f1f000000000000000010",
        "name": "Nguyen Van A",
        "displayName": "Nguyen Van A",
        "email": "student@example.com",
        "avatar": "",
        "status": "active",
        "role": "student"
      },
      "repository": {
        "id": "665f1f000000000000000020",
        "name": "api-project",
        "fullName": "student/api-project",
        "htmlUrl": "https://github.com/student/api-project",
        "language": "JavaScript"
      },
      "roadmapSource": {},
      "roleMatch": {},
      "skillGapSummary": [],
      "mainRoadmap": {},
      "alternativeRoadmaps": [],
      "progressSummary": {
        "totalItems": 12,
        "completedItems": 4,
        "inProgressItems": 2,
        "pendingItems": 6,
        "overallProgress": 33
      },
      "learningProgress": {
        "currentTask": {},
        "recentlyCompleted": [],
        "nextRecommendedTask": {},
        "completedTasks": [],
        "inProgressTasks": [],
        "pendingTasks": [],
        "orphanProgressItems": [],
        "items": [
          {
            "itemId": "main-1-1-rest-api",
            "title": "Build REST API",
            "description": "Create CRUD endpoints",
            "skillName": "REST API",
            "canonicalSkillName": "REST API",
            "category": "Backend",
            "priority": "high",
            "week": 1,
            "phase": "Phase 1",
            "estimatedHours": 6,
            "status": "in_progress",
            "progressPercent": 50,
            "startedAt": "2026-07-15T00:00:00.000Z",
            "completedAt": null
          }
        ]
      },
      "createdAt": "2026-07-15T00:00:00.000Z",
      "updatedAt": "2026-07-15T00:00:00.000Z"
    }
  },
  "errorCode": null
}
```

## 4. Y nghia tung field

- `progressSummary`: summary nhe cho list/detail. `pendingItems` do BE tinh san, khong can FE tu tru.
- `learningProgress`: chi co trong detail, gom full task-level progress da merge metadata.
- `currentTask`: task `in_progress` uu tien cao nhat; neu khong co thi fallback sang next recommended.
- `recentlyCompleted`: toi da 5 task completed gan nhat theo `completedAt`.
- `nextRecommendedTask`: task `in_progress` hoac pending uu tien cao/gan week nhat.
- `completedTasks`: tat ca task roadmap co status `completed`.
- `inProgressTasks`: tat ca task roadmap co status `in_progress`.
- `pendingTasks`: tat ca task roadmap co status `not_started`.
- `orphanProgressItems`: progress item ton tai trong `RoadmapProgress` nhung khong con task metadata tu roadmap. BE tra rieng, khong tron vao `items`.

## 5. Quy tac fallback

- Chua co progress: BE van tra `learningProgress.items` tu Roadmap task, status `not_started`, `progressPercent: 0`, `startedAt/completedAt: null`.
- Repository null: BE tra repository object fallback co `id` neu con repositoryId goc; cac field name/fullName/htmlUrl/language co the rong.
- User null: BE tra `user: null`; API khong crash.
- Task khong con ton tai: BE dua vao `orphanProgressItems`.
- Task moi chua co progress: BE dua vao `items` va `pendingTasks`.
- Roadmap soft deleted: mac dinh list/detail loai bo. Dung `includeDeleted=true` neu Admin can xem.
- Duplicate progress itemId: BE lay item dau tien theo thu tu document, bo qua duplicate de response deterministic.

## 6. Huong dan FE cap nhat

- FE bo logic tu tinh `pendingItems = totalItems - completedItems - inProgressItems`.
- List dung `data.items[].progressSummary` de render progress bar/count.
- Detail dung `data.roadmap.learningProgress.items` de render task table/timeline.
- Render status theo `completed`, `in_progress`, `not_started`.
- Khi `user` hoac `repository` null/fallback rong, render placeholder nhu `Unknown user` hoac `Repository unavailable`.
- Khong can goi them user roadmap progress API tu man Admin detail.
- Chi goi detail khi Admin mo mot roadmap cu the; list da co summary du de hien bang.

## 7. Backward compatibility

User roadmap API khong thay doi contract. BE chi thay doi Admin roadmap response va reuse `formatGeneratedRoadmapResponse()` lam contract nen tang.

## 8. Cach test

List:

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "http://localhost:5000/api/admin/roadmaps?page=1&limit=20"
```

Detail:

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "http://localhost:5000/api/admin/roadmaps/<ROADMAP_ID>"
```

Soft-deleted detail:

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "http://localhost:5000/api/admin/roadmaps/<ROADMAP_ID>?includeDeleted=true"
```

Checklist QA:

- Admin list co `progressSummary.pendingItems`.
- Admin detail co `learningProgress.items`.
- Roadmap chua hoc task nao tra all pending.
- Roadmap dang hoc do co `currentTask`.
- Roadmap hoan thanh co `overallProgress: 100`.
- Roadmap chua co `RoadmapProgress` van tra task list.
- Task moi chua co progress nam trong `pendingTasks`.
- Orphan progress nam trong `orphanProgressItems`.
- Soft-deleted roadmap chi xem duoc khi `includeDeleted=true`.
- User/repository null khong lam API crash.
- Token khong phai admin bi middleware tu choi.
- `roadmapId` sai format hoac khong ton tai tra 404.

# Realtime Admin/User Chat

## 1. Kien truc realtime

- REST API va MongoDB van la source of truth.
- Socket.IO chi push delta moi cho client sau khi MongoDB save/update thanh cong.
- Message history van load bang REST detail.
- Moi chat session co room rieng: `chat-session:{sessionId}`.
- Server khong replay toan bo history qua socket; FE refetch REST neu nghi ngo mat event.

Socket.IO duoc attach vao cung HTTP server voi Express, cung port backend, khong co port rieng.

## 2. Cai dat phia FE

BE dung Socket.IO, FE can cai:

```bash
npm install socket.io-client
```

## 3. Socket URL

- Local: dung cung backend URL, vi du `http://localhost:5000`.
- Production: dung API URL production, vi du `https://<backend>.onrender.com`.
- Khong them port rieng cho socket.
- Neu trang FE chay HTTPS, Socket.IO se dung WSS/HTTPS transport tu dong.

Nen dung bien moi truong FE:

```js
const API_URL = import.meta.env.VITE_API_URL;
```

## 4. Authentication handshake

Gui access token qua handshake auth:

```js
import { io } from "socket.io-client";

const socket = io(API_URL, {
  auth: {
    token: accessToken
  }
});
```

BE cung chap nhan `Authorization: Bearer <token>` trong handshake headers. FE khong gui `userId`, `role`, `senderType`, `isAdmin`; server tu xac dinh tu JWT.

## 5. Connect va join room

```js
socket.on("connect", () => {
  socket.emit("chat:join", { sessionId }, (ack) => {
    if (!ack?.success) {
      console.error(ack?.error);
      return;
    }
    console.log("joined", ack.sessionId, ack.joinedAt);
  });
});

socket.emit("chat:leave", { sessionId }, (ack) => {
  console.log("left", ack);
});

socket.on("disconnect", (reason) => {
  console.log("socket disconnected", reason);
});
```

## 6. Danh sach event

| Event | Direction | Payload | Khi dung |
| --- | --- | --- | --- |
| `chat:join` | Client -> Server | `{ sessionId }` | Join room sau khi load detail |
| `chat:leave` | Client -> Server | `{ sessionId }` | Roi man detail/session |
| `chat:typing` | Client -> Server | `{ sessionId, isTyping }` | Thong bao dang go, transient |
| `chat:read` | Client -> Server | `{ sessionId }` | Reset unread theo actor JWT |
| `chat:message_created` | Server -> Client | `{ sessionId, message, emittedAt }` | Co user/admin/AI message moi |
| `chat:session_updated` | Server -> Client | `{ sessionId, session, emittedAt }` | Status, unread, mode, close state thay doi |
| `chat:typing` | Server -> Client | `{ sessionId, isTyping, actorId, actorType, role, timestamp }` | Actor khac dang typing |
| `chat:read_updated` | Server -> Client | `{ sessionId, session, actor, emittedAt }` | User/Admin da doc session |
| `chat:error` | Server -> Client | Not used currently | Socket handlers tra error qua acknowledgement |

`chat:message_updated` chua duoc emit vi BE hien chua co flow sua message.

## 7. Payload mau

### chat:message_created

```json
{
  "sessionId": "665f1f000000000000000001",
  "message": {
    "_id": "665f1f000000000000000100",
    "sessionId": "665f1f000000000000000001",
    "userId": "665f1f000000000000000010",
    "role": "assistant",
    "senderType": "ADMIN",
    "senderId": "665f1f000000000000000999",
    "content": "Minh da xem roadmap cua ban.",
    "metadata": {},
    "createdAt": "2026-07-15T00:00:00.000Z",
    "updatedAt": "2026-07-15T00:00:00.000Z"
  },
  "emittedAt": "2026-07-15T00:00:00.000Z"
}
```

### chat:session_updated

```json
{
  "sessionId": "665f1f000000000000000001",
  "session": {
    "_id": "665f1f000000000000000001",
    "userId": "665f1f000000000000000010",
    "repositoryId": "665f1f000000000000000020",
    "roadmapId": null,
    "analysisId": null,
    "snapshotId": null,
    "contextSelectionReason": "session_repository",
    "contextPinned": true,
    "contextPinnedAt": "2026-07-15T00:00:00.000Z",
    "title": "New GitHub Mentor Chat",
    "lastMessage": "Minh da xem roadmap cua ban.",
    "status": "answered",
    "mode": "MANUAL",
    "modeSource": "SESSION",
    "effectiveMode": "MANUAL",
    "unreadByAdmin": false,
    "unreadByUser": true,
    "lastMessageAt": "2026-07-15T00:00:00.000Z",
    "lastResponseAt": "2026-07-15T00:00:00.000Z",
    "closedAt": null,
    "closedBy": null,
    "closeReason": "",
    "createdAt": "2026-07-15T00:00:00.000Z",
    "updatedAt": "2026-07-15T00:00:00.000Z"
  },
  "emittedAt": "2026-07-15T00:00:00.000Z"
}
```

### chat:typing

```json
{
  "sessionId": "665f1f000000000000000001",
  "isTyping": true,
  "actorId": "665f1f000000000000000010",
  "actorType": "USER",
  "role": "student",
  "timestamp": "2026-07-15T00:00:00.000Z"
}
```

### chat:read_updated

```json
{
  "sessionId": "665f1f000000000000000001",
  "session": {
    "_id": "665f1f000000000000000001",
    "unreadByAdmin": false,
    "unreadByUser": true
  },
  "actor": {
    "actorId": "665f1f000000000000000999",
    "actorType": "ADMIN",
    "role": "admin"
  },
  "emittedAt": "2026-07-15T00:00:00.000Z"
}
```

### chat:error

Most command errors are returned through acknowledgement:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Forbidden"
  }
}
```

## 8. Flow man hinh User Chat

1. Call REST `GET /api/chat/sessions/{sessionId}` de lay full history.
2. Connect socket voi JWT.
3. Emit `chat:join`.
4. Register listeners: `chat:message_created`, `chat:session_updated`, `chat:typing`, `chat:read_updated`.
5. Gui message bang REST `POST /api/chat/sessions/{sessionId}/messages`.
6. Nhan AI/Admin response qua `chat:message_created`.
7. Khi roi man hinh: `chat:leave`, `socket.off(...)`.

## 9. Flow man hinh Admin Chat

1. Call REST `GET /api/admin/chat/sessions` de load list.
2. Mo detail: `GET /api/admin/chat/sessions/{sessionId}`.
3. Connect socket voi admin JWT.
4. Emit `chat:join`.
5. Admin reply bang REST `POST /api/admin/chat/sessions/{sessionId}/messages`.
6. Nhan user message realtime qua `chat:message_created`.
7. Cap nhat waiting/unread/status bang `chat:session_updated`.
8. Khi Admin doc session, emit `chat:read`.

## 10. Reconnect

- Socket.IO tu reconnect theo client config.
- Sau moi lan `connect`, FE phai emit lai `chat:join`.
- Neu nghi ngo mat event, refetch REST detail.
- Dang ky listener mot lan trong lifecycle, khong dang ky lai sau moi render.

## 11. Chong duplicate

FE nen dedupe:

- Message theo `message._id`.
- Session update theo `session.updatedAt` hoac `emittedAt`.
- Khong append message neu `_id` da co trong state.

## 12. Cleanup React

```js
useEffect(() => {
  if (!socket || !sessionId) return;

  const onMessage = (event) => {
    setMessages((current) => {
      if (current.some((item) => item._id === event.message._id)) return current;
      return [...current, event.message];
    });
  };

  const onSessionUpdated = (event) => {
    setSession(event.session);
  };

  socket.emit("chat:join", { sessionId });
  socket.on("chat:message_created", onMessage);
  socket.on("chat:session_updated", onSessionUpdated);

  return () => {
    socket.emit("chat:leave", { sessionId });
    socket.off("chat:message_created", onMessage);
    socket.off("chat:session_updated", onSessionUpdated);
  };
}, [socket, sessionId]);
```

## 13. Error handling

- `connect_error` voi code/message unauthorized: token sai/het han, logout hoac refresh token.
- `FORBIDDEN`: user khong co quyen join session, hoac account inactive.
- `SESSION_NOT_FOUND`: session da bi xoa/khong ton tai.
- `INVALID_SESSION`: sessionId sai format.
- `disconnect`/`reconnect_attempt`: hien trang thai reconnecting.

## 14. REST API van can dung

- User load history: `GET /api/chat/sessions/{sessionId}`
- User send message: `POST /api/chat/sessions/{sessionId}/messages`
- Admin list: `GET /api/admin/chat/sessions`
- Admin detail/history: `GET /api/admin/chat/sessions/{sessionId}`
- Admin reply: `POST /api/admin/chat/sessions/{sessionId}/messages`
- Admin close: `PATCH /api/admin/chat/sessions/{sessionId}/close`
- Admin change mode: `PATCH /api/admin/chat/sessions/{sessionId}/mode`
- Admin use global mode: `PATCH /api/admin/chat/sessions/{sessionId}/use-global-mode`
- Read/unread realtime: socket `chat:read`

## 15. Huong dan test FE

Checklist hai browser/incognito:

- User va Admin connect hop le.
- Token sai bi reject qua `connect_error`.
- User khong join duoc session nguoi khac.
- User gui message REST, Admin nhan `chat:message_created`.
- Admin reply REST, User nhan `chat:message_created`.
- AI response realtime dung mot lan.
- `waiting_admin` -> `answered` realtime.
- Mode change realtime.
- Close realtime.
- Unread reset qua `chat:read` va nhan `chat:read_updated`.
- Typing realtime, khong tu broadcast ve chinh socket gui.
- Reconnect xong join lai room.
- Khong nhan message tu room khac.
- Reload trang van load du history bang REST.
- Khong duplicate message khi REST response va socket event cung ve.

## 16. Luu y deploy

- Render/production dung cung process port voi REST.
- Khong can mo port rieng cho Socket.IO.
- Health check REST van la `/health` hoac `/api/health`.
- HTTPS frontend se dung WSS tu dong qua Socket.IO.
- CORS socket dung cung allowed frontend origins voi Express.
- Neu chi chay mot instance, khong can Redis adapter.
- Neu autoscaling/multi-instance, can Socket.IO Redis adapter/shared pub-sub va co the can sticky sessions tuy platform.
