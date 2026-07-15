# FE Chat Context, AI Mentor & Delete Integration Guide

## 1. Tong Quan

Chat hien khong chi la hoi AI chung chung nua. Moi chat session/message co the duoc gan voi context cu the:

- Repository nao
- Roadmap nao
- Analysis nao
- Snapshot nao

Backend cung da co soft delete/close policy:

- Roadmap delete = soft delete bang `isDeleted`, `deletedAt`, `deletedBy`.
- User chat delete = soft hide bang `userDeletedAt`, khong hard delete messages.
- Admin close chat = `status=closed`, khong hard delete session/messages.

Muc tieu FE can nam:

- Tranh chat lay nham latest analysis cua toan user.
- Tao chat gan voi repo/roadmap dung ngu canh.
- Render AI Mentor answers ve role fit, next skills, repo comparison, CV/interview, roadmap/progress.
- Delete roadmap/chat session dung API.
- Xu ly closed session dung UX.

## 2. Endpoint Chat User

### 2.1 Tao Chat Session

```http
POST /api/chat/sessions
Authorization: Bearer <user_jwt>
Content-Type: application/json
```

Body:

```json
{
  "title": "Tu van WDP_G3",
  "repositoryId": "optional",
  "roadmapId": "optional",
  "analysisId": "optional",
  "snapshotId": "optional"
}
```

Rules:

- `title` nen duoc FE gui khi tao session.
- `repositoryId`, `roadmapId`, `analysisId`, `snapshotId` la optional context selectors.
- Gui `repositoryId` thi BE pin session theo repo do.
- Gui `roadmapId` thi BE pin session theo roadmap do.
- Khong gui context thi BE fallback latest user analysis khi user hoi.

Vi du tao session theo repo:

```json
{
  "title": "Tu van WDP_G3",
  "repositoryId": "64..."
}
```

Vi du tao session theo roadmap:

```json
{
  "title": "Tu van roadmap Backend",
  "roadmapId": "64..."
}
```

Vi du tao session khong context:

```json
{
  "title": "Tu van chung"
}
```

Response chinh:

```json
{
  "success": true,
  "data": {
    "session": {
      "_id": "...",
      "title": "Tu van WDP_G3",
      "repositoryId": "...",
      "roadmapId": null,
      "analysisId": "...",
      "snapshotId": "...",
      "contextSelectionReason": "body_repository",
      "contextPinnedAt": "2026-07-15T00:00:00.000Z",
      "mode": "AI_AUTO",
      "modeSource": "GLOBAL",
      "status": "active"
    },
    "context": {
      "repositoryId": "...",
      "repoName": "WDP_G3",
      "analysisId": "...",
      "snapshotId": "...",
      "roadmapId": null,
      "analysisSource": "analysis_result",
      "contextSelectionReason": "body_repository",
      "contextPinned": true
    }
  }
}
```

### 2.2 Lay Danh Sach Chat Session

```http
GET /api/chat/sessions
Authorization: Bearer <user_jwt>
```

FE can doc them cac field neu BE tra:

- `repositoryId`
- `roadmapId`
- `analysisId`
- `snapshotId`
- `contextSelectionReason`
- `contextPinnedAt`
- `status`
- `effectiveMode`
- `mode`
- `modeSource`
- `lastMessage`
- `unreadByUser`
- `unreadByAdmin`

### 2.3 Lay Detail Session

```http
GET /api/chat/sessions/:sessionId
Authorization: Bearer <user_jwt>
```

Render message theo `senderType`, khong render theo `role` cu:

| senderType | FE render |
|---|---|
| `USER` | User bubble |
| `AI` | AI Mentor bubble |
| `ADMIN` | Admin/support bubble |

### 2.4 Gui Message

```http
POST /api/chat/sessions/:sessionId/messages
Authorization: Bearer <user_jwt>
Content-Type: application/json
```

Body:

```json
{
  "message": "Toi hop Backend hay Frontend hon?",
  "repositoryId": "optional",
  "roadmapId": "optional",
  "analysisId": "optional",
  "snapshotId": "optional"
}
```

Rules:

- Neu session da pin context, FE chi can gui `{ "message": "..." }`.
- Neu FE muon doi context, gui `repositoryId`/`roadmapId` moi kem message.
- Body selector override session context va BE se pin lai session theo selector moi.

## 3. Context Priority O BE

Backend resolve context theo thu tu:

1. Body `roadmapId`
2. Body `repositoryId`
3. Body `analysisId`/`snapshotId`
4. Session `roadmapId`
5. Session `repositoryId`
6. Session `analysisId`/`snapshotId`
7. Latest `AnalysisResult` cua user
8. Legacy `AnalysisSnapshot`
9. None

FE integration rule:

- Chat tao tu repo page: gui `repositoryId` ngay luc tao session.
- Chat tao tu roadmap page: gui `roadmapId` ngay luc tao session.
- Chat tu `/chat` chung: nen cho user chon repo/roadmap context.
- Khong nen de user hoi chung khi co nhieu repo ma khong co context badge/selector ro rang.

## 4. Response Context / Provenance

Response `POST /api/chat/sessions/:sessionId/messages` co the co:

```json
{
  "context": {
    "repositoryId": "...",
    "repoName": "WDP_G3",
    "roadmapId": "...",
    "analysisId": "...",
    "snapshotId": "...",
    "progressUpdatedAt": "2026-07-15T00:00:00.000Z",
    "analysisSource": "analysis_result",
    "contextSelectionReason": "session_repository",
    "contextPinned": true,
    "intent": "ROLE_FIT",
    "intents": ["ROLE_FIT"],
    "hasRoadmapContext": false,
    "hasComparisonContext": false,
    "comparedRepoCount": 0
  }
}
```

Suggested badges:

- `repoName` co gia tri: `AI dang dung du lieu tu repo: WDP_G3`
- `roadmapId` co gia tri: `AI dang dung ngu canh roadmap`
- `contextSelectionReason=latest_user_analysis`: `AI dang dung phan tich moi nhat cua ban`
- `hasComparisonContext=true`: `Dang so sanh {comparedRepoCount} repo`
- Khong co context: `Chua co du lieu phan tich ro rang`

## 5. `contextSelectionReason` Values

| Value | Meaning for FE |
|---|---|
| `body_roadmap` | Context den tu `roadmapId` trong message hien tai |
| `body_repository` | Context den tu `repositoryId` trong message hien tai |
| `body_analysis` | Context den tu `analysisId` hoac `snapshotId` trong message hien tai |
| `session_roadmap` | Context da pin trong ChatSession theo roadmap |
| `session_repository` | Context da pin trong ChatSession theo repository |
| `session_analysis` | Context da pin trong ChatSession theo analysis/snapshot |
| `latest_user_analysis` | User/FE chua chon context, BE dung analysis moi nhat |
| `legacy_snapshot` | BE fallback du lieu cu |
| `none` | Khong tim duoc context |

## 6. AI Mentor Intents

BE hien co cac intent:

- `WEAK_SKILLS`
- `STRONG_SKILLS`
- `NEXT_SKILLS`
- `ROLE_FIT`
- `REPO_REVIEW`
- `DETAIL_REQUEST`
- `GENERAL`
- `REPO_COMPARE`
- `ROADMAP_PROGRESS`
- `CV_ADVICE`
- `INTERVIEW_PREP`
- `TIMEBOX_PRIORITY`

FE khong bat buoc tu detect intent. FE co the dung `intent`/`intents` trong response de debug hoac render suggested prompts.

Intent moi:

| Intent | Meaning | Example prompt |
|---|---|---|
| `REPO_COMPARE` | So sanh repo | `Repo nao nen dua vao CV?` |
| `ROADMAP_PROGRESS` | Hoi ve tien do roadmap | `Task tiep theo nen lam gi?` |
| `CV_ADVICE` | Tu van CV/portfolio | `Dua tren repo nay, toi nen ghi gi vao CV?` |
| `INTERVIEW_PREP` | Chuan bi phong van | `Toi nen chuan bi phong van Backend ra sao?` |
| `TIMEBOX_PRIORITY` | Uu tien theo thoi gian | `2 tuan toi nen hoc gi truoc?` |

## 7. FE UX De Xuat Cho Chat

### 7.1 Trang `/chat` Chung

Khi tao chat moi, modal nen co:

- Tieu de
- Ngu canh tu van

Options ngu canh:

- Khong chon: dung phan tich moi nhat
- Repository da phan tich:
  - `WDP_G3 - Backend Developer - 68%`
  - `Plantcare_admin_Web - Frontend Developer - 32%`
- Roadmap neu FE co san danh sach roadmap

Khi user chon repo:

```http
POST /api/chat/sessions
```

```json
{
  "title": "Tu van WDP_G3",
  "repositoryId": "<repoId>"
}
```

Khi user chon roadmap:

```json
{
  "title": "Tu van roadmap Backend",
  "roadmapId": "<roadmapId>"
}
```

### 7.2 Tu Repository Page

Them nut: `Hoi AI ve repo nay`

Khi bam:

```http
POST /api/chat/sessions
```

```json
{
  "title": "Tu van WDP_G3",
  "repositoryId": "<repoId>"
}
```

Sau do navigate sang `/chat` va mo session moi.

### 7.3 Tu Roadmap Detail

Them nut: `Hoi AI ve roadmap nay`

Khi bam:

```http
POST /api/chat/sessions
```

```json
{
  "title": "Tu van roadmap Backend",
  "roadmapId": "<roadmapId>"
}
```

Sau do navigate sang `/chat` va mo session moi.

## 8. Suggested Prompts FE Nen Hien Thi

Neu session co `repositoryId`/`repoName`:

- `Tai sao toi hop role nay?`
- `Repo nay con yeu ky nang gi?`
- `2 tuan toi nen hoc gi truoc?`
- `Dua tren repo nay, toi nen ghi gi vao CV?`
- `Toi nen chuan bi phong van gi?`

Neu session co `roadmapId`:

- `Tien do roadmap cua toi the nao?`
- `Task tiep theo nen lam gi?`
- `Toi dang bi cham o dau?`
- `2 tuan toi nen uu tien task nao?`

Neu session khong co context:

- `Toi hop Backend hay Frontend hon?`
- `Repo nao nen dua vao CV?`
- `So sanh cac repo da phan tich cua toi`
- `Toi nen hoc gi tiep theo?`

## 9. User/Admin Chat Mode

Render message theo `senderType`:

- `USER`
- `AI`
- `ADMIN`

Chat mode:

- `AI_AUTO`: user gui message, BE co the tra `userMessage` + `aiMessage`.
- `MANUAL`: user gui message, session cho admin phan hoi, khong loading AI mai.

FE behavior:

- Branch UI theo `effectiveMode` neu response co.
- Manual mode: show trang thai cho admin, khong hien AI typing/loading lien tuc.
- Admin message van co the co `role=assistant`, nen FE phai dung `senderType`.

## 10. Closed Chat Session

Admin close endpoint:

```http
PATCH /api/admin/chat/sessions/:sessionId/close
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

Request body optional:

```json
{
  "reason": "Da xu ly xong yeu cau"
}
```

Closed session behavior:

- User van xem history neu chua delete.
- User khong gui tiep duoc.
- Admin khong reply/switch mode/use global duoc.
- Error tra `errorCode=CHAT_SESSION_CLOSED`.

FE behavior:

- Neu `session.status=closed`, show badge `Da dong`.
- Disable composer.
- Show text: `Session da dong, ban khong the gui them tin nhan.`
- Neu API tra `CHAT_SESSION_CLOSED`, sync lai session detail/list.

## 11. Delete User Chat Session

Endpoint:

```http
DELETE /api/chat/sessions/:sessionId
Authorization: Bearer <user_jwt>
```

Behavior:

- User delete la soft hide bang `userDeletedAt`.
- Khong hard delete messages.
- Sau success FE remove khoi sidebar/list.
- Neu dang mo session bi xoa, clear detail hoac chon session khac.

Response success:

```json
{
  "success": true,
  "message": "Chat session deleted successfully",
  "data": {
    "sessionId": "...",
    "deleted": true
  },
  "errorCode": null
}
```

FE behavior:

- Confirm truoc khi xoa.
- Goi `DELETE`.
- Remove session khoi sidebar.
- Neu session dang mo bi xoa, clear detail hoac mo session khac.
- Khong reload toan page neu khong can.

## 12. Roadmap Delete

Endpoint:

```http
DELETE /api/roadmaps/:roadmapId
Authorization: Bearer <user_jwt>
```

Policy:

- Roadmap delete la soft delete.
- BE set `isDeleted=true`, `deletedAt`, `deletedBy`.
- Khong hard delete Roadmap record.
- Khong xoa User, Repository, AnalysisResult, RepoAnalysisSnapshot, shared LearningContent, Chat sessions.

Behavior:

- User chi xoa duoc roadmap cua chinh minh.
- `GET /api/roadmaps/me` khong tra roadmap da deleted.
- `GET /api/roadmaps/:roadmapId` voi roadmap da deleted tra `404`.
- Learning/progress endpoints cua roadmap da deleted tra `404`.

Response success:

```json
{
  "success": true,
  "message": "Roadmap deleted successfully",
  "data": {
    "roadmapId": "...",
    "deleted": true
  },
  "errorCode": null
}
```

FE behavior:

- Them nut `Xoa roadmap` o roadmap list/detail neu phu hop.
- Confirm truoc khi xoa.
- Sau success remove roadmap khoi local list/cache.
- Neu dang o roadmap detail thi navigate ve roadmap list.
- Khong goi learning/progress cho roadmap da xoa.
- Neu `DELETE` tra `404`, co the coi nhu roadmap khong con ton tai va remove khoi local list/cache.
- Khong dung archive thay cho delete. Archive va delete la 2 hanh vi khac nhau.

Manual test FE:

1. Vao roadmap list.
2. Xoa 1 roadmap.
3. Roadmap bien mat khoi list.
4. Mo lai detail bang URL cu phai hien `404`/not found.
5. Khong con goi learning/progress cua roadmap da xoa.

## 13. Admin Chat APIs Lien Quan

```http
GET /api/admin/chat/settings
PATCH /api/admin/chat/settings
GET /api/admin/chat/sessions
GET /api/admin/chat/sessions/:sessionId
PATCH /api/admin/chat/sessions/:sessionId/mode
POST /api/admin/chat/sessions/:sessionId/messages
PATCH /api/admin/chat/sessions/:sessionId/use-global-mode
PATCH /api/admin/chat/sessions/:sessionId/close
```

FE admin:

- Inbox sessions.
- Detail messages.
- Reply.
- Switch mode.
- Close session.
- Disable reply/switch/use-global actions when session is closed.

## 14. Realtime Socket Dinh Huong Sau Nay

Hien tai REST van la source chinh.

Send message van dung REST:

```http
POST /api/chat/sessions/:sessionId/messages
POST /api/admin/chat/sessions/:sessionId/messages
```

Realtime update sau nay chi nen dung de cap nhat UI nhanh:

1. FE goi REST gui message.
2. BE luu message.
3. BE emit socket event.
4. FE dang mo session nhan event va append message.

Event de xuat:

- `chat:message_created`
- `chat:session_updated`
- `chat:session_closed`
- `chat:session_deleted`
- `chat:mode_changed`
- `roadmap:deleted`

Khong chuyen gui message sang socket o buoc dau.

## 15. FE Implementation Checklist

Chat:

- [ ] `chatApi.createSession` nhan object payload co context selectors.
- [ ] `chatApi.sendMessage` giu optional selectors.
- [ ] `ChatSession` type co `repositoryId`, `roadmapId`, `analysisId`, `snapshotId`.
- [ ] `ChatContext` type co `repoName`, `contextSelectionReason`, `intent`, `intents`.
- [ ] Modal tao chat co repository selector.
- [ ] Chat tu repo gui `repositoryId`.
- [ ] Chat tu roadmap gui `roadmapId`.
- [ ] Header chat hien thi provenance.
- [ ] Suggested prompts theo context.
- [ ] Render message theo `senderType`.
- [ ] Manual mode khong loading AI.
- [ ] Closed session disable composer.
- [ ] Delete session remove khoi sidebar.
- [ ] Khong log JWT/token/full prompt.

Roadmap delete:

- [ ] `roadmapApi.deleteRoadmap(roadmapId)` goi `DELETE /api/roadmaps/:roadmapId`.
- [ ] Roadmap list co action xoa neu phu hop.
- [ ] Roadmap detail co action xoa neu phu hop.
- [ ] Confirm modal truoc khi xoa.
- [ ] Sau xoa remove khoi state/cache.
- [ ] Neu dang o detail thi navigate ve roadmap list.
- [ ] Khong goi learning/progress sau khi xoa.
- [ ] `404` sau delete duoc xu ly nhu not found/remove local.

Admin chat:

- [ ] Admin detail co nut dong session.
- [ ] Closed session disable reply/switch mode/use global.
- [ ] User chat thay session closed thi disable composer.
- [ ] Handle `errorCode=CHAT_SESSION_CLOSED`.

## 16. Manual Test Cases Cho FE

### Test 1: Tao chat chon repo

1. Vao `/chat`.
2. Tao session moi.
3. Chon repo `WDP_G3`.
4. Gui: `Toi hop Backend hay Frontend hon?`
5. Network response phai co:
   - `contextSelectionReason=session_repository`
   - `repoName=WDP_G3`

### Test 2: Tao chat khong context

1. Tao session khong chon repo.
2. Gui message.
3. Response co the la `latest_user_analysis`.
4. UI phai hien thi `AI dang dung phan tich moi nhat`.

### Test 3: Chat tu repo page

1. Bam `Hoi AI ve repo nay`.
2. FE tao session voi `repositoryId`.
3. Chat header hien thi `repoName`.

### Test 4: Chat tu roadmap detail

1. Bam `Hoi AI ve roadmap nay`.
2. FE tao session voi `roadmapId`.
3. Hoi: `Tien do roadmap cua toi the nao?`
4. Response `hasRoadmapContext=true` neu BE co roadmap context.

### Test 5: So sanh repo

1. Gui: `Repo nao nen dua vao CV?`
2. Response `intent=REPO_COMPARE` hoac `CV_ADVICE`.
3. `hasComparisonContext=true` neu co nhieu analysis.

### Test 6: Closed session

1. Admin close session.
2. User mo session.
3. Composer disabled.
4. Neu co gui message bang API, FE handle `CHAT_SESSION_CLOSED`.

### Test 7: Delete chat session

1. User xoa chat session.
2. Session bien mat khoi sidebar.
3. Neu dang mo session bi xoa, FE clear detail hoac chon session khac.

### Test 8: Delete roadmap

1. User xoa roadmap o list/detail.
2. FE goi `DELETE /api/roadmaps/:roadmapId`.
3. Roadmap bien mat khoi list.
4. Neu dang o detail, FE navigate ve list.
5. Reload list, roadmap da xoa khong xuat hien.
6. Vao URL detail cu thi FE hien not found hoac redirect phu hop.

## 17. Notes

- FE khong can tu tinh role score.
- FE khong can tu build mentor context.
- FE chi can gui dung context selector va render provenance.
- BE la source of truth cho context/intent.
- Voi cau hoi so sanh repo cu the, hien BE tu dung latest analyses per repo; chua co official `repoIds[]` selector.
- Khong hardcode repo name/id.
- Khong dung task index lam `itemId`.
- Khong log token.
- Archive roadmap khac delete roadmap.
- Delete roadmap la soft delete, khong xoa analysis/snapshot/learning/chat.
