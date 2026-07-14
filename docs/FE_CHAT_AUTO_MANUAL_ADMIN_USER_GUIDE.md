# FE Chat Auto / Manual / Admin Guide

Tài liệu này gom phần FE cần để làm đúng giao diện và gọi API cho chat user, AI auto, manual admin, và admin chat management.

Nguồn backend liên quan:

- User chat APIs: `src/routes/chat.routes.js`
- Admin chat APIs: `src/routes/admin.routes.js`
- Logic mode auto/manual: `src/services/chat.service.js`
- Skill context AI auto: `docs/chat-skill-vector-context.md`
- Admin mode chi tiết: `docs/chat-admin-mode.md`

## 1. Khái niệm chính

Chat có 2 mode:

| Mode | Ý nghĩa FE |
|---|---|
| `AI_AUTO` | User gửi message, backend gọi AI/Gemini và trả `aiMessage` ngay trong response |
| `MANUAL` | User gửi message, backend chỉ lưu message, không gọi AI, session chờ admin trả lời |

Mode có 2 nguồn:

| Field | Ý nghĩa |
|---|---|
| `mode` | Mode đang lưu trên session hoặc setting |
| `modeSource` | `GLOBAL` nghĩa là session theo global setting; `SESSION` nghĩa là session bị admin override riêng |
| `effectiveMode` | Mode thực tế FE phải dùng để render hành vi hiện tại |

FE nên luôn branch theo `effectiveMode`, không tự suy luận từ `mode`.

## 2. User Chat UI

### Màn danh sách chat của user

Gọi:

```http
GET /api/chat/sessions
Authorization: Bearer <user_jwt>
```

Gợi ý UI:

- Sidebar/list chat sessions.
- Hiển thị `title`, `lastMessage`, `status`, `updatedAt` hoặc `lastMessageAt`.
- Badge trạng thái:
  - `active`: AI/normal.
  - `waiting_admin`: đang chờ admin.
  - `answered`: admin đã trả lời.
  - `closed`: đã đóng nếu sau này FE có dùng.
- Nếu `unreadByUser=true`, highlight session.

### Tạo session mới

```http
POST /api/chat/sessions
Authorization: Bearer <user_jwt>
Content-Type: application/json
```

```json
{
  "title": "Tư vấn roadmap backend"
}
```

Response chính:

```json
{
  "success": true,
  "data": {
    "session": {
      "_id": "...",
      "title": "Tư vấn roadmap backend",
      "status": "active",
      "mode": "AI_AUTO",
      "modeSource": "GLOBAL"
    }
  }
}
```

FE lấy `session._id` để vào màn chat detail.

### Lấy detail session

```http
GET /api/chat/sessions/:sessionId
Authorization: Bearer <user_jwt>
```

Response có:

- `data.session`
- `data.messages[]`

Render message theo `senderType`:

| senderType | UI |
|---|---|
| `USER` | bubble bên phải |
| `AI` | bubble bên trái, label AI Mentor |
| `ADMIN` | bubble bên trái, label Admin/Support |

Không render dựa vào `role` vì admin message cũng có thể dùng `role="assistant"`. Dùng `senderType` là chính.

## 3. User gửi message

Endpoint:

```http
POST /api/chat/sessions/:sessionId/messages
Authorization: Bearer <user_jwt>
Content-Type: application/json
```

Body tối thiểu:

```json
{
  "message": "Tôi nên học gì tiếp theo?"
}
```

Body có context selector:

```json
{
  "message": "Dựa trên roadmap này, tôi nên ưu tiên task nào?",
  "roadmapId": "665f1f000000000000000020"
}
```

Selector priority backend đang dùng:

1. `roadmapId`: ưu tiên cao nhất, có pinned analysis/snapshot và progress hiện tại.
2. `repositoryId`: dùng latest analysis của repo đó.
3. `analysisId` hoặc `snapshotId`: dùng đúng record user sở hữu.
4. Không selector: dùng latest context nếu có.

## 4. User message trong AI_AUTO

Khi `effectiveMode="AI_AUTO"`, response có `userMessage` và `aiMessage`.

Ví dụ:

```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "mode": "AI_AUTO",
    "effectiveMode": "AI_AUTO",
    "modeSource": "GLOBAL",
    "status": "active",
    "userMessage": {
      "_id": "...",
      "senderType": "USER",
      "content": "Tôi nên học gì tiếp theo?"
    },
    "aiMessage": {
      "_id": "...",
      "senderType": "AI",
      "content": "..."
    },
    "context": {
      "repositoryId": "...",
      "analysisId": "...",
      "snapshotId": "...",
      "roadmapId": "...",
      "progressUpdatedAt": "2026-07-14T00:00:00.000Z",
      "analysisSource": "analysis_result"
    }
  }
}
```

FE behavior:

- Append `userMessage`.
- Append `aiMessage`.
- Không chờ admin.
- Có thể show small label: "AI Mentor".
- Trong dev, response có thể thêm `intent`, `contextSource`, `skillScoreSummary`; FE không nên phụ thuộc các field này ở production.

## 5. User message trong MANUAL

Khi `effectiveMode="MANUAL"`, backend không gọi AI.

Ví dụ:

```json
{
  "success": true,
  "message": "Tin nhan da duoc gui.",
  "data": {
    "mode": "MANUAL",
    "effectiveMode": "MANUAL",
    "modeSource": "SESSION",
    "status": "waiting_admin",
    "userMessage": {
      "_id": "...",
      "senderType": "USER",
      "content": "Tôi cần admin hỗ trợ trực tiếp"
    },
    "adminMessage": null
  }
}
```

FE behavior:

- Append `userMessage`.
- Không show loading AI vô hạn.
- Show state: "Đang chờ admin trả lời".
- Có thể disable text "AI đang trả lời" vì không có AI call.
- Poll/reload session detail hoặc dùng realtime nếu FE có websocket sau này.

## 6. Intent AI auto đang hỗ trợ

Chỉ áp dụng khi `effectiveMode="AI_AUTO"`.

Backend detect intent keyword đơn giản:

| Intent | FE example prompt |
|---|---|
| `WEAK_SKILLS` | "Tôi đang yếu kỹ năng gì?" |
| `STRONG_SKILLS` | "Tôi mạnh kỹ năng gì?" |
| `NEXT_SKILLS` | "Tôi nên học gì tiếp?" |
| `ROLE_FIT` | "Tôi hợp backend hay frontend?" |
| `REPO_REVIEW` | "Review repo của tôi" |
| `DETAIL_REQUEST` | "Giải thích kỹ hơn skill REST API" |
| `GENERAL` | Câu hỏi chung |

FE không cần gửi intent. Backend tự detect từ `message`.

Nếu chưa có analysis/skill data, AI auto có thể trả câu dạng:

```text
Hien chua co phan tich Dev2Vec tu repository. Hay phan tich repo truoc de minh tu van role va skill gap chinh xac hon.
```

FE nên show CTA:

- Connect GitHub nếu chưa connect.
- Chọn repo.
- Analyze repo.

## 7. Admin Chat Settings UI

Admin lấy global mode:

```http
GET /api/admin/chat/settings
Authorization: Bearer <admin_jwt>
```

Response:

```json
{
  "success": true,
  "data": {
    "mode": "AI_AUTO",
    "aiEnabled": true,
    "manualEnabled": false,
    "updatedBy": null,
    "updatedAt": "..."
  }
}
```

Admin đổi global mode:

```http
PATCH /api/admin/chat/settings
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

```json
{
  "mode": "MANUAL"
}
```

Gợi ý UI:

- Toggle/segmented control: `AI Auto` / `Manual`.
- Warning khi chuyển global sang `MANUAL`: user message mới ở session `modeSource=GLOBAL` sẽ chờ admin, không gọi AI.
- Nói rõ session đã bị override `SESSION` không bị global setting đổi trực tiếp.

## 8. Admin Chat Inbox UI

Danh sách session:

```http
GET /api/admin/chat/sessions?status=waiting_admin&page=1&limit=20
Authorization: Bearer <admin_jwt>
```

Filter hỗ trợ:

| Query | Giá trị |
|---|---|
| `status` | `active`, `waiting_admin`, `answered`, `closed` |
| `mode` | `AI_AUTO`, `MANUAL` |
| `modeSource` | `GLOBAL`, `SESSION` |
| `userId` | Mongo user id |
| `assignedAdminId` | Mongo admin id |
| `page`, `limit` | pagination |

Response chính:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "...",
        "user": {
          "_id": "...",
          "email": "student@example.com",
          "fullName": "Student"
        },
        "status": "waiting_admin",
        "mode": "MANUAL",
        "modeSource": "SESSION",
        "effectiveMode": "MANUAL",
        "assignedAdminId": "...",
        "unreadByAdmin": true,
        "unreadByUser": false,
        "lastMessage": {
          "senderType": "USER",
          "content": "..."
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

Gợi ý UI:

- Tabs: `Waiting admin`, `Active AI`, `Answered`, `All`.
- Badge:
  - `effectiveMode=AI_AUTO`: AI Auto.
  - `effectiveMode=MANUAL`: Manual.
  - `modeSource=SESSION`: Override.
  - `modeSource=GLOBAL`: Global.
- Sort theo `lastMessageAt` mới nhất.
- Highlight `unreadByAdmin=true`.

## 9. Admin Session Detail UI

Lấy detail:

```http
GET /api/admin/chat/sessions/:sessionId
Authorization: Bearer <admin_jwt>
```

Render:

- Header user info.
- Status/mode/effectiveMode/modeSource.
- Manual reason nếu có.
- Messages ascending.
- Composer admin reply.
- Actions:
  - Switch to manual.
  - Switch to AI auto.
  - Use global mode.

## 10. Admin chuyển một session sang manual

```http
PATCH /api/admin/chat/sessions/:sessionId/mode
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

```json
{
  "mode": "MANUAL",
  "reason": "User cần admin hỗ trợ trực tiếp"
}
```

Backend set:

- `mode=MANUAL`
- `modeSource=SESSION`
- `effectiveMode=MANUAL`
- `status=waiting_admin`
- assign admin hiện tại

FE sau khi success:

- Update badge session thành Manual Override.
- Show composer admin reply.
- User message mới trong session này sẽ không gọi AI.

## 11. Admin trả lời thủ công

```http
POST /api/admin/chat/sessions/:sessionId/messages
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

```json
{
  "content": "Admin đã kiểm tra, bạn nên phân tích lại repo backend trước."
}
```

Response:

```json
{
  "success": true,
  "message": "Admin message sent successfully",
  "data": {
    "adminMessage": {
      "_id": "...",
      "senderType": "ADMIN",
      "content": "Admin đã kiểm tra..."
    },
    "session": {
      "_id": "...",
      "status": "answered",
      "mode": "MANUAL",
      "modeSource": "SESSION",
      "effectiveMode": "MANUAL",
      "unreadByUser": true
    }
  }
}
```

FE behavior:

- Append `adminMessage`.
- Mark session `answered`.
- Keep session manual after admin reply.
- User sees admin bubble by `senderType=ADMIN`.

## 12. Admin chuyển session về AI auto

```http
PATCH /api/admin/chat/sessions/:sessionId/mode
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

```json
{
  "mode": "AI_AUTO"
}
```

Backend set:

- `mode=AI_AUTO`
- `modeSource=SESSION`
- `status=active`
- clear manual assignment fields

FE behavior:

- Badge: AI Auto Override.
- Từ user message tiếp theo, backend có thể trả AI message.
- Tin nhắn admin/AI cũ vẫn giữ nguyên.

## 13. Admin cho session dùng global mode lại

```http
PATCH /api/admin/chat/sessions/:sessionId/use-global-mode
Authorization: Bearer <admin_jwt>
```

FE behavior:

- Badge `modeSource=GLOBAL`.
- Hiển thị `effectiveMode` backend trả về.
- Không tự đoán global mode ở FE.

## 14. Recommended User Flow

1. User mở chat page.
2. FE gọi `GET /api/chat/sessions`.
3. Nếu chưa có session, FE gọi `POST /api/chat/sessions`.
4. FE gọi `GET /api/chat/sessions/:sessionId`.
5. User gửi message bằng `POST /api/chat/sessions/:sessionId/messages`.
6. Nếu response `effectiveMode=AI_AUTO`, append `userMessage` + `aiMessage`.
7. Nếu response `effectiveMode=MANUAL`, append `userMessage`, show waiting admin.
8. FE poll/reload detail khi user quay lại session để thấy admin reply.

## 15. Recommended Admin Flow

1. Admin mở chat dashboard.
2. FE gọi `GET /api/admin/chat/settings`.
3. FE gọi `GET /api/admin/chat/sessions?status=waiting_admin`.
4. Admin mở session detail: `GET /api/admin/chat/sessions/:sessionId`.
5. Nếu cần takeover, gọi `PATCH /mode` với `MANUAL`.
6. Admin reply bằng `POST /messages`.
7. Khi muốn trả về AI, gọi `PATCH /mode` với `AI_AUTO` hoặc `PATCH /use-global-mode`.

## 16. Error Handling

| Case | FE nên làm |
|---|---|
| `401` | Yêu cầu login lại |
| `403` admin API | User không phải admin, ẩn admin UI |
| `404` session | Session không tồn tại hoặc không thuộc user, quay về list |
| `400` validation | Kiểm tra body `message`, `content`, `mode` |
| `effectiveMode=MANUAL` | Không chờ AI; show chờ admin |
| `aiMessage=null` | Chỉ render user/admin message có thật |
| No skill data message | Show CTA analyze repo |

## 17. FE Checklist

- [ ] User chat render theo `senderType`, không theo `role`.
- [ ] User send message branch theo `effectiveMode`.
- [ ] Manual mode không show AI loading vô hạn.
- [ ] Admin có global mode toggle.
- [ ] Admin có session filters theo `status`, `mode`, `modeSource`.
- [ ] Admin có action switch manual, AI auto, use global.
- [ ] Admin reply tạo bubble `ADMIN`.
- [ ] FE không phụ thuộc debug fields `intent`, `contextSource`, `skillScoreSummary` trong production.
- [ ] FE gửi `roadmapId` khi chat cần context roadmap/progress.
- [ ] FE gửi `repositoryId` khi chat cần context repo cụ thể.
- [ ] FE không log JWT, prompt đầy đủ, source code, hoặc provider payload.
