# FE Roadmap Learning Item Contract

## 1. Scope

This document describes the current Backend contract for Roadmap Learning Item. It reflects the code currently in:

- `src/routes/roadmap.routes.js`
- `src/controllers/roadmapLearning.controller.js`
- `src/services/roadmapLearning.service.js`
- `src/services/learning.service.js`
- `src/models/Roadmap.js`
- `src/models/LearningContent.js`
- `src/models/LearningResource.js`

No local roadmap node, title, skill name, or `location.state` is required to resolve an item. The authoritative identity is `roadmapId + itemId`.

## 2. Endpoints

All three endpoints require the authenticated user (`authMiddleware`). The roadmap is also scoped by `userId`.

| Endpoint | Controller | Service | Success | Main errors |
|---|---|---|---|---|
| `GET /api/roadmaps/:roadmapId/learning` | `getRoadmapLearning` | `getRoadmapLearning` | `200` | `401`, `404` |
| `GET /api/roadmaps/:roadmapId/learning/items/:itemId` | `getRoadmapItemLearning` | `getRoadmapItemLearning` | `200` | `400`, `401`, `404`, `409`, Gemini/resource errors |
| `POST /api/roadmaps/:roadmapId/learning/items/:itemId/generate` | `generateRoadmapItemLearning` | `generateRoadmapItemLearning` | `200` or `201` | `400`, `401`, `404`, `409`, `429`, `503` |

`GET detail` accepts query parameters:

```text
includeResources=true|false
```

The default is `true`. `language` is not read from the detail query; language comes from `roadmap.language` and defaults to `vi`.

Generate accepts an optional JSON body:

```json
{
  "forceRegenerate": false,
  "includeResources": true
}
```

`forceRegenerate` defaults to `false`. `includeResources` defaults to `true`. `language` is not a generate body override.

## 3. List contract

Request:

```text
GET /api/roadmaps/{roadmapId}/learning
```

Response envelope:

```json
{
  "success": true,
  "message": "Roadmap learning fetched successfully",
  "data": {
    "roadmapId": "...",
    "sourceMode": "single_repo",
    "language": "vi",
    "items": [
      {
        "itemId": "main-1-1-component-design-a1b2c3d4",
        "taskTitle": "Build reusable components",
        "canonicalSkillName": "Component Design",
        "skillName": "Component Design",
        "targetRole": "Frontend Developer",
        "level": "advanced",
        "week": 1,
        "priority": "medium",
        "learningStatus": "missing"
      }
    ]
  },
  "errorCode": null
}
```

Current list values for `learningStatus` are `available` and `missing`.

- `available`: a matching `LearningContent` document exists.
- `missing`: the roadmap task exists, but content was not found.

The list is summary-only. It does not return learning content or resources. It must not be used as the detail-page content source. `GET detail` is authoritative for a selected item.

## 4. Detail contract: current behavior

Request:

```text
GET /api/roadmaps/{roadmapId}/learning/items/{itemId}?includeResources=true
```

When content exists, the current response is:

```json
{
  "success": true,
  "message": "Roadmap item learning found",
  "data": {
    "roadmapId": "...",
    "itemId": "...",
    "task": {
      "title": "Build reusable components",
      "description": "...",
      "skillName": "Component Design",
      "canonicalSkillName": "Component Design",
      "category": "Frontend",
      "targetRole": "Frontend Developer",
      "level": "advanced",
      "week": 1,
      "priority": "medium",
      "estimatedHours": 4
    },
    "learning": {
      "skillName": "Component Design",
      "canonicalSkillName": "Component Design",
      "targetRole": "Frontend Developer",
      "level": "advanced",
      "language": "vi",
      "title": "...",
      "overview": "...",
      "whyLearn": "...",
      "useCases": [],
      "howToApply": "...",
      "examples": [],
      "checklist": [],
      "exercises": [],
      "commonMistakes": [],
      "nextSkills": [],
      "resources": []
    },
    "personalizedContext": {},
    "progress": null
  },
  "errorCode": null
}
```

Important: the current Backend uses `data.learning`, not `data.learningContent`. It does not currently add `learningStatus` to this detail response.

When the task exists but content has not been generated, the current Backend does **not** return a `200` missing-state detail object. `learningService.getLearningContent()` throws:

```json
{
  "success": false,
  "message": "Learning content not found. Please generate it first.",
  "data": null,
  "errorCode": "REQUEST_ERROR",
  "errors": []
}
```

The HTTP status is `404`. FE must therefore treat this specific detail `404` as `missing/generateable` only after the item identity is known from the route/list. A roadmap that does not exist, or a task `itemId` that does not exist, also returns `404`; FE should distinguish the message/context.

When `includeResources=false`, the response still contains `learning.resources`, but it is an empty array. Resources are never `null` in the formatted success response.

## 5. Generate contract

Request:

```text
POST /api/roadmaps/{roadmapId}/learning/items/{itemId}/generate
Content-Type: application/json
```

```json
{
  "forceRegenerate": false,
  "includeResources": true
}
```

The response returns the generated content directly using the same `data` shape as detail: `data.task`, `data.learning`, `data.personalizedContext`, `data.progress`. It does not return a separate `learningContent` field.

- `201`: newly generated content.
- `200`: existing content was reused when `forceRegenerate=false`.

The operation is cache-idempotent for the same roadmap/task identity, but there is no explicit in-process lock for double-click/concurrent generation. FE must disable the generate button while a request is pending and use the cache key `${roadmapId}:${itemId}`.

Recommended FE behavior after success: use the response directly, or refetch detail if the store has one canonical normalizer. Do not merge it with list-summary fields.

## 6. Identity and cache

Task lookup is exact:

```text
roadmapId → Roadmap.findOne({_id: roadmapId, userId, isDeleted != true})
itemId    → exact task.itemId equality
```

Duplicate matches do not silently select the first task. The service throws HTTP `409` with code `ROADMAP_ITEM_ID_CONFLICT` and logs roadmap ID, item ID, and matching titles.

LearningContent stores:

```text
roadmapId
roadmapItemId
contentCacheKey
normalizedSkillName
normalizedTargetRole
level
language
```

Roadmap learning queries use `roadmapId + roadmapItemId` plus role/level/language. The normalized key also includes the roadmap scope for roadmap-specific content. Legacy skill-level records may still exist and are read through the legacy normalized identity path in `learning.service.js`; FE must not use `learningContentId` as the item identity. If returned by the database, an internal `_id` is not required by this contract.

Two roadmaps with the same `itemId` must not intentionally share roadmap-item content. The FE cache must never be keyed only by skill, canonical skill, or roadmap ID.

## 7. Resources

Resources are returned inside `data.learning.resources`.

Sources are:

1. `LearningResource` catalog/cache.
2. Curated resources.
3. YouTube API search and cache when the caller is the generate flow and cached resources are unavailable.

`GET detail` uses cached/catalog resources only (`searchIfMissing=false`). `POST generate` can search YouTube when resources are missing (`searchIfMissing=true`). `includeResources=false` disables both lookup and search.

No valid resource is represented as `[]`, not `null`. Empty resources are not an error and must not keep the page in skeleton state. Render content and show an optional “no suitable resources” message.

Use a stable resource key:

```ts
`${roadmapId}:${itemId}:${resource.id ?? resource._id ?? resource.youtubeVideoId ?? resource.url}`
```

## 8. Gemini and API errors

The error envelope is:

```json
{
  "success": false,
  "message": "Failed to generate content from Gemini",
  "data": null,
  "errorCode": "GEMINI_RATE_LIMITED",
  "errors": []
}
```

The detailed `llmError.upstreamMessage` is logged by Backend and may not be exposed by the generic response formatter. Current error codes:

| Code | Typical HTTP | FE action |
|---|---:|---|
| `GEMINI_AUTH_FAILED` | 401/403 | Show configuration/auth message; retry is not useful until key/permission changes. |
| `GEMINI_RATE_LIMITED` | 429 | End loading, show quota/rate-limit message, allow delayed retry. |
| `GEMINI_GENERATION_FAILED` | 400/500/503 | End loading, show retry; inspect backend log for upstream message. |
| `ROADMAP_ITEM_ID_CONFLICT` | 409 | End loading and show data-conflict message; do not choose a task. |
| task/roadmap not found | 404 | Show not-found state; distinguish content-missing message when applicable. |

Generate failure must always reset `generating` state. It must not erase already rendered content. `resources=[]` is not a Gemini failure.

## 9. FE state machine

```text
idle
  → loading (GET detail)
  → success + missing (current contract: GET returns 404 content-missing)
  → success + ready (data.learning exists)
  → generating (POST)
  → success/ready
  → error (any non-recoverable error)
```

Recommended store fields:

```ts
type LoadStatus = "idle" | "loading" | "success" | "error";
type LearningViewState = "missing" | "ready" | "not_found" | "conflict" | "error";

roadmapItemStatus: LoadStatus;
roadmapItemViewState: LearningViewState;
roadmapItemData: RoadmapLearningItemDetail | null;
roadmapItemError: unknown | null;
currentLearningKey: string | null;
generatingItemKey: string | null;
```

Never use:

```tsx
if (!learningContent) return <Skeleton />;
```

Skeleton is only for an active request. Once an HTTP response or error is received, render content, CTA, or error UI.

## 10. Normalizer mapping

For a successful detail/generate response:

```text
response.data.data.roadmapId → roadmapId
response.data.data.itemId → itemId
response.data.data.task → task
response.data.data.learning → learning
response.data.data.learning.resources → resources
response.data.data.progress → progress
```

Do not read `data.learningContent`, `data.item`, or `data.learning.resources` at the response-envelope level. Do not construct detail content from the list item.

Route effect:

```ts
useEffect(() => {
  if (!roadmapId || !itemId) return;
  fetchRoadmapItemDetail(roadmapId, itemId);
}, [roadmapId, itemId]);
```

Do not block the request because a local `taskNode` is absent. Do not depend on `location.state`.

## 11. Status matrix

| Situation | HTTP | success | errorCode | FE result |
|---|---:|---:|---|---|
| Valid item, content ready | 200 | true | null | Render `data.learning`. |
| Valid item, content missing | 404 currently | false | `REQUEST_ERROR` | Show generate CTA if message is content-missing; leave skeleton. |
| Content ready, resources empty | 200 | true | null | Render content; resources empty state. |
| Item/roadmap not found | 404 | false | `REQUEST_ERROR` | Not-found UI. |
| Duplicate item ID | 409 | false | `ROADMAP_ITEM_ID_CONFLICT` | Conflict UI; never select first task. |
| Gemini rate limit | 429 | false | `GEMINI_RATE_LIMITED` | End loading; delayed retry/quota message. |
| Gemini auth | 401/403 | false | `GEMINI_AUTH_FAILED` | End loading; configuration message. |
| Gemini timeout/upstream unavailable | 503 | false | `GEMINI_GENERATION_FAILED` | End loading; retry UI. |
| YouTube/catalog unavailable | normally success with `resources=[]` | true | null | Render content without resources. |
| Other backend error | 500 | false | `GEMINI_GENERATION_FAILED` or generic | End loading; retry/error UI. |

## 12. Current Backend gaps FE must know

The intended product state `200 + learningStatus="missing" + learningContent=null` is not the current detail implementation. Current detail uses `404` for missing content. Also, detail/generate use `learning`, not `learningContent`, and no detail `learningStatus` is emitted.

These are the most likely causes of a permanently displayed skeleton:

- FE waits for `learningContent` although Backend returns `data.learning`.
- FE treats all `404` responses as route-not-found, although content-missing also uses `404`.
- FE expects list `learningStatus` to contain full content.
- FE waits for resources/video before leaving loading.
- FE blocks the request when local `taskNode` is absent.
- FE cache key omits `itemId` or `roadmapId`.
- A stale request for item A overwrites state for item B.

## 13. Acceptance criteria

- Clicking Learn requests `GET /api/roadmaps/:roadmapId/learning/items/:itemId`.
- Direct URL reload works without local task state.
- The list endpoint is used only for summary.
- Detail reads `response.data.data.learning`.
- Missing-content `404` ends skeleton and shows Generate CTA.
- `resources=[]` still renders the learning page.
- Generate disables its button and always resets loading on success/error.
- Generate success updates the same `${roadmapId}:${itemId}` item.
- A response for item A cannot overwrite item B.
- `401/403/429/503/409/404` receive distinct UI handling.
- FE never selects the first task on an item ID conflict.

