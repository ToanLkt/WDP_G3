# 09. Roadmap - Learning Relationship

## Final conclusion

Roadmap does **not** store a real `ObjectId` reference to `LearningContent` or `LearningResource`.

The Roadmap -> Learning relationship is a **runtime/API mapping** from embedded roadmap tasks to the shared learning cache. The lookup key is built from:

```text
roadmap task canonicalSkillName
+ task targetRole fallback roadmap.targetRole
+ task level fallback roadmap.effectiveLevel/requestedLevel
+ roadmap.language
-> LearningContent normalizedSkillName + normalizedTargetRole + level + language
```

For the MongoDB database diagram, draw:

- `RoadmapProgress.roadmapId -> Roadmap._id` as a solid ObjectId reference.
- `Roadmap.mainPath.phases[].tasks[]` / `Roadmap.mainRoadmap.phases[].tasks[]` to `LearningContent` as a dashed logical/runtime mapping, not a DB ref.
- `LearningContent` to `LearningResource` as a dashed logical mapping by normalized/canonical skill identity plus role/level/language, not ObjectId.

There is no `learningContentId`, `learningResourceId`, `roadmapId`, or `roadmapItemId` stored on `LearningContent`. A `LearningContent` document can be shared by many roadmaps whose task identity resolves to the same normalized cache key.

## Direct answers

### A. Roadmap co luu ObjectId truc tiep toi LearningContent hoac LearningResource khong?

**NOT IMPLEMENTED.** `Roadmap` has ObjectId refs to `User`, `Repository`, and `AnalysisSnapshot`, but no `learningContentId` or `learningResourceId`. A source search also found no such field in models/services/routes/controllers.

### B. LearningContent co luu roadmapId hoac roadmapItemId khong?

**NOT IMPLEMENTED.** `LearningContent` stores skill/cache identity fields only: `skillName`, `canonicalSkillName`, `normalizedSkillName`, `targetRole`, `normalizedTargetRole`, `level`, `language`, and generated content fields.

### C. Roadmap task/item co luu skillName, canonicalSkillName, targetRole, level hay field nao khac de goi Learning API?

**CONFIRMED.** The `roadmapTaskSchema` embeds `skillName`, `canonicalSkillName`, `itemId`, `level`, and `targetRole`. Runtime mapping can also synthesize `itemId`, canonicalize skill name, and fallback target role/level from the roadmap if task fields are missing.

### D. Endpoint GET /api/roadmaps/{roadmapId}/learning hoat dong nhu the nao?

Call chain:

```text
GET /api/roadmaps/:roadmapId/learning
-> authMiddleware
-> roadmapLearningController.getRoadmapLearning
-> roadmapLearningService.getRoadmapLearning
-> Roadmap.findOne({ _id: roadmapId, userId }).lean()
-> extractRoadmapTasks(roadmap)
-> buildLearningQueryFromTask(roadmap, task)
-> learningService.buildLearningIdentity(query)
-> LearningContent.findOne({
     normalizedSkillName,
     normalizedTargetRole,
     level,
     language
   }).lean()
-> response items[] with learningStatus available/missing
```

The endpoint does not load resources and does not return `LearningContent._id`; it returns availability per `itemId`.

### E. Roadmap-Learning relation type

Actual type:

5. **runtime/API mapping, no persisted database relationship**
4. **composite logical key** internally after normalization:

```text
canonicalSkillName + targetRole + level + language
=> normalizedSkillName + normalizedTargetRole + level + language
```

It is not an ObjectId reference and not embedded.

### F. LearningContent va LearningResource co quan he truc tiep voi nhau khong?

**CONFIRMED logical relationship only.** They do not store ObjectId references to each other. They share identity fields: `skillName`, `canonicalSkillName`, `normalizedSkillName`, `targetRole`, `normalizedTargetRole`, `level`, and `language`. `LearningResource` adds `type` to its query/index.

### G. Mot LearningContent co the dung chung cho nhieu roadmap khong?

**CONFIRMED / INFERRED from cache key.** The learning APIs are explicitly shared skill APIs, and `LearningContent` uniqueness is by normalized skill/role/level/language, not by roadmap. Therefore any roadmap task resolving to the same cache key reuses the same `LearningContent`.

### H. RoadmapProgress lien ket voi learning nhu the nao?

`RoadmapProgress` has a real ObjectId ref to `Roadmap` and stores embedded progress items by `itemId`, `skillName`, `canonicalSkillName`, `targetRole`, and `level`. It does not reference `LearningContent` or `LearningResource`. `roadmapLearning.service` reads progress for a task by `{ userId, roadmapId }` and `items[].itemId` only when formatting item learning detail.

## Evidence table

| Claim | Status | File | Lines | Explanation |
|---|---|---|---|---|
| Roadmap task embeds `skillName`, `canonicalSkillName`, `itemId`, `level`, `targetRole` | CONFIRMED | `src/models/Roadmap.js` | `39-46` | These fields exist inside `roadmapTaskSchema`. |
| Roadmap root stores `targetRole` and `language` | CONFIRMED | `src/models/Roadmap.js` | `128-137` | These are used as fallback/default identity for learning mapping. |
| Roadmap model has no learning ObjectId fields | NOT IMPLEMENTED | `src/models/Roadmap.js`; source search | `115-200`; search result only prompt mention | No `learningContentId`/`learningResourceId`; search found no implementation field. |
| LearningContent cache identity fields | CONFIRMED | `src/models/LearningContent.js` | `22-56` | Stores skill/canonical/normalized role/level/language. |
| LearningContent unique cache key | CONFIRMED | `src/models/LearningContent.js` | `77-82` | Unique index on `normalizedSkillName`, `normalizedTargetRole`, `level`, `language`. |
| LearningContent does not store roadmap id/item id | NOT IMPLEMENTED | `src/models/LearningContent.js` | `20-84` | No `roadmapId`, `roadmapItemId`, `itemId`, `taskId`. |
| LearningResource cache identity fields | CONFIRMED | `src/models/LearningResource.js` | `5-39` | Same skill/role/level/language identity plus `type`. |
| LearningResource index uses normalized skill/role/level/language/type | CONFIRMED | `src/models/LearningResource.js` | `78-83` | Query/index key for resources. |
| LearningResource has no LearningContent ObjectId | NOT IMPLEMENTED | `src/models/LearningResource.js` | `3-87` | No `learningContentId` or ref to `LearningContent`. |
| RoadmapProgress references Roadmap | CONFIRMED | `src/models/RoadmapProgress.js` | `65-77` | `roadmapId` is `ObjectId` ref `Roadmap`. |
| RoadmapProgress item stores task identity but no learning ref | CONFIRMED | `src/models/RoadmapProgress.js` | `5-33` | Embedded item fields include `itemId`, skill, role, level; no learning id. |
| Roadmap learning route exists | CONFIRMED | `src/routes/roadmap.routes.js` | `647-679` | `GET /:roadmapId/learning` maps to controller. |
| Roadmap item learning routes exist | CONFIRMED | `src/routes/roadmap.routes.js` | `683-769` | `GET` and `POST generate` item endpoints use `roadmapId` + `itemId`. |
| Shared learning generation route exists | CONFIRMED | `src/routes/learning.routes.js` | `21-60` | `POST /api/learning/skills/generate` accepts skill/targetRole/level/language/forceRegenerate. |
| Roadmap learning controller passes route params only | CONFIRMED | `src/controllers/roadmapLearning.controller.js` | `4-34` | Calls service with `req.user`, `roadmapId`, `itemId`, body/query. |
| Learning controller uses shared skill API params/body | CONFIRMED | `src/controllers/learning.controller.js` | `4-60` | Shared API takes skillName path/body plus targetRole/level/language. |
| Roadmap is fetched by user + roadmap id | CONFIRMED | `src/services/roadmapLearning.service.js` | `43-49` | `Roadmap.findOne({ _id: roadmapId, userId }).lean()`. |
| Roadmap tasks are extracted from embedded roadmap structures | CONFIRMED | `src/services/roadmapLearning.service.js` | `78-108` | Extracts from `mainRoadmap.phases` or `mainPath.phases`, plus alternatives. |
| Runtime item id is generated from scope/phase/task/canonical skill | CONFIRMED | `src/services/roadmapLearning.service.js` | `38-41`, `51-75` | Mapping is based on embedded task content; not DB ref. |
| Learning query from roadmap task uses skill/role/level/language | CONFIRMED | `src/services/roadmapLearning.service.js` | `115-121` | Builds `{ skillName, canonicalSkillName, targetRole, level, language }`. |
| Roadmap learning availability queries LearningContent cache | CONFIRMED | `src/services/roadmapLearning.service.js` | `123-133`, `224-258` | Uses normalized skill/role/level/language, returns `available` or `missing`. |
| Item learning uses shared learning service and optional resources | CONFIRMED | `src/services/roadmapLearning.service.js` | `260-278` | Calls `learningService.getLearningContent(query)` and `getResourcesForLearning`. |
| Item learning generation uses `forceRegenerate` | CONFIRMED | `src/services/roadmapLearning.service.js` | `280-325` | Calls `generateLearningContent({ ...query, forceRegenerate })`. |
| Learning identity canonicalizes skill and normalizes role/level/language | CONFIRMED | `src/services/learning.service.js` | `38-56` | Converts skillName to canonical and normalized cache identity. |
| Shared get content uses composite normalized query | CONFIRMED | `src/services/learning.service.js` | `140-166` | `LearningContent.findOne(canonicalQuery)`. |
| Shared generate content uses same composite query and upsert | CONFIRMED | `src/services/learning.service.js` | `176-229` | `findOneAndUpdate(contentQuery, ..., upsert: true)`. |
| Resources use similar logical key plus type | CONFIRMED | `src/services/learning.service.js` | `83-96`, `252-280` | `buildResourceQuery` and `sortResources(query)`. |
| Resource save is unique by URL, not by LearningContent id | CONFIRMED | `src/services/learning.service.js`; `src/models/LearningResource.js` | `288-329`; `85` | Upsert query is `{ url }`; URL index is unique. |
| Progress is merged into item learning by itemId only | CONFIRMED | `src/services/roadmapLearning.service.js` | `170-178`, `206-221` | Reads `RoadmapProgress.items` and finds matching `itemId`. |

## Database diagram recommendation

Use this conceptual mapping:

```text
Roadmap._id
  <- RoadmapProgress.roadmapId                    solid ObjectId ref

Roadmap.mainPath.phases[].tasks[].canonicalSkillName
+ Roadmap/task targetRole
+ Roadmap/task level
+ Roadmap.language
  -> LearningContent.normalizedSkillName
   + LearningContent.normalizedTargetRole
   + LearningContent.level
   + LearningContent.language                     dashed logical/runtime mapping

LearningContent normalizedSkillName
+ normalizedTargetRole
+ level
+ language
  -> LearningResource normalizedSkillName
   + normalizedTargetRole
   + level
   + language                                     dashed logical mapping
```

Do **not** add:

```dbml
Ref: roadmapitems.learningContentId > learningcontents._id
Ref: learningresources.learningContentId > learningcontents._id
```

Those fields are not implemented.

## Recommended diagram notation

- Solid line: only for actual ObjectId refs, e.g. `roadmapprogresses.roadmapId > roadmaps._id`.
- Dashed/logical line: Roadmap task identity to `LearningContent` cache identity.
- Dashed/logical line: `LearningContent` to `LearningResource` shared identity.
- Add a note that roadmap tasks are embedded documents inside `Roadmap`; DBML cannot directly reference `roadmaps.mainPath.phases[].tasks[].canonicalSkillName`.
- Add a note that actual query uses normalized values: `normalizedSkillName` and `normalizedTargetRole`, derived from canonical skill and target role.

## Exact DBML patch

Paste or replace the Roadmap/Learning part of `database.dbml` with this more accurate version:

```dbml
Table roadmaps {
  _id objectId [pk]
  userId objectId
  repositoryId objectId
  targetRole string
  requestedLevel string
  effectiveLevel string
  language string [note: "Used in Roadmap -> Learning runtime cache lookup"]
  status string
  mainPath json [note: "Embeds phases[].tasks[]. Task fields include itemId, skillName, canonicalSkillName, targetRole, level."]
  mainRoadmap json [note: "Runtime/service also reads mainRoadmap.phases[].tasks[] when present."]
  alternativeRoadmaps json [note: "Runtime/service also reads alternativeRoadmaps[].tasks[] when present."]
}

Table roadmapprogresses {
  _id objectId [pk]
  userId objectId
  roadmapId objectId
  items json [note: "Embedded progress items keyed by itemId; stores skillName, canonicalSkillName, targetRole, level. No learningContentId."]
  overallProgress number
}

Table learningcontents {
  _id objectId [pk]
  skillName string
  canonicalSkillName string
  normalizedSkillName string
  targetRole string
  normalizedTargetRole string
  level string
  language string
  examples json [note: "embedded"]
  exercises json [note: "embedded"]

  indexes {
    (normalizedSkillName, normalizedTargetRole, level, language) [unique]
  }
}

Table learningresources {
  _id objectId [pk]
  skillName string
  canonicalSkillName string
  normalizedSkillName string
  targetRole string
  normalizedTargetRole string
  level string
  language string
  type string
  url string [unique]
  source string

  indexes {
    (normalizedSkillName, normalizedTargetRole, level, language, type)
    (url) [unique]
  }
}

Ref: roadmapprogresses.roadmapId > roadmaps._id

// Logical/runtime mapping only, not ObjectId:
// roadmaps.mainPath.phases[].tasks[].canonicalSkillName
// + task.targetRole fallback roadmaps.targetRole
// + task.level fallback roadmaps.effectiveLevel/requestedLevel
// + roadmaps.language
//   -> learningcontents.normalizedSkillName
//    + learningcontents.normalizedTargetRole
//    + learningcontents.level
//    + learningcontents.language

// Logical cache identity only, not ObjectId:
// learningcontents.normalizedSkillName
// + learningcontents.normalizedTargetRole
// + learningcontents.level
// + learningcontents.language
//   -> learningresources.normalizedSkillName
//    + learningresources.normalizedTargetRole
//    + learningresources.level
//    + learningresources.language
```

