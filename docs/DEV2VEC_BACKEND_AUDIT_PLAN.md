# Dev2Vec Backend Audit And Migration Plan

Ngay 2026-07-05. Audit nay chi doc code hien tai, chua sua logic runtime.

## 1. Endpoint Map

Tat ca endpoint ben duoi deu qua `successResponse`, root response co dang:

```json
{
  "success": true,
  "message": "...",
  "data": {},
  "errorCode": null
}
```

### `POST /api/analysis/repositories/:repoId`

- Route/controller/service/model:
  - `src/routes/analysis.routes.js`
  - `src/controllers/analysis.controller.js#analyzeRepository`
  - `src/services/analysis.service.js#analyzeRepository`
  - `src/services/analysis/analysis.engine.js#buildAnalysisPayload`
  - `src/models/Repository.js`
  - `src/models/RepositoryPackage.js`
  - `src/models/RepositoryCommit.js`
  - `src/models/GithubAccount.js`
  - `src/models/AnalysisResult.js`
  - `src/models/RepoAnalysisSnapshot.js` qua `snapshot.service`
- Params/query/body:
  - params: `repoId`
  - query: `view=summary|detail`, `includeEvidence=true|false`
  - body: controller truyen body nhung service hien khong dung.
- Response `data` thuc te la mot analysis object:
  - `analysisId`, `snapshotId`
  - `repository.repositoryId`, `githubRepoId`, `repoName`, `fullName`
  - `analysisScope.type`, `githubUsername`, `totalRepoCommits`, `userCommits`, `activeDays`, `firstCommitDate`, `lastCommitDate`
  - `summary.careerDirection`, `userLevel`, `userReadinessScore`, `overallScore`, `projectType`, `confidence`
  - `topSkills[]`: `skill`, `canonicalSkillName`, `category`, `score`, `level`
  - `missingSkills[]`: `skill`, `canonicalSkillName`, `category`, `priority`
  - `strengths[]`, `weaknesses[]`, `recommendations[]`, `createdAt`
  - detail only: `analyzedAt`, `analysisScope.analyzedCommitShas`, `scoreBreakdown`
  - detail + evidence: `debug.skillVector[]`
- Analysis/role/skill/roadmap fields:
  - Analysis: `summary`, `scoreBreakdown`, `analysisScope`, `topSkills`, `missingSkills`, `strengths`, `weaknesses`, `recommendations`
  - Skill: `topSkills`, `missingSkills`, `debug.skillVector`
- Can giu ten field:
  - Tat ca field tren, dac biet `summary`, `topSkills`, `missingSkills`, `strengths`, `weaknesses`, `recommendations`, `scoreBreakdown`.
- Co the them optional:
  - `vectorInfo`, `modelVersion`, `vectorSources`, `sourceStats`, `rolePredictions`, `analysisSource.modelStatus`.

### `GET /api/analysis/results/:repoId`

- Route/controller/service/model:
  - `analysis.routes.js`
  - `analysis.controller.js#getAnalysisResults`
  - `analysis.service.js#getAnalysisResults`
  - `findRepositoryForUser`
  - `AnalysisResult`
- Params/query/body:
  - params: `repoId`
  - query: `view`, `includeEvidence`
  - body: none.
- Response:
  - `data.analysis` = same formatted analysis object as above.
- Can giu:
  - `data.analysis` wrapper bat buoc giu.
- Optional:
  - Them Dev2Vec metadata ben trong `data.analysis` hoac `data.analysis.debug` khi detail.

### `GET /api/analysis/me`

- Route/controller/service/model:
  - `analysis.routes.js`
  - `analysis.controller.js#getMyAnalysisResults`
  - `analysis.service.js#getMyAnalysisResults`
  - `AnalysisResult`
- Params/query/body:
  - query: `view`, `includeEvidence`
- Response:
  - `data.total`
  - `data.analyses[]` compact list item: `analysisId`, `snapshotId`, `repository`, `analysisScope`, `summary`, `topSkills`, `missingSkills`, `analyzedAt`
  - list item xoa `strengths`, `weaknesses`, `recommendations`, `createdAt`.
- Can giu:
  - `total`, `analyses`, list item fields.
- Optional:
  - `modelVersion`, `vectorSources`, `rolePredictions` per analysis neu FE bo qua duoc.

### `POST /api/analysis/role-matches`

- Route/controller/service/model:
  - `analysis.routes.js`
  - `analysis.controller.js#generateRoleMatches`
  - `analysis.service.js#generateRoleMatches`
  - `analysisSource.service.js#resolveUserContributionSource`
  - `roleMatching.service.js#matchSkillVectorToRoles`
  - `AnalysisResult`
  - `ROLE_SKILL_VECTORS`
- Body/query:
  - body: `sourceMode`, `repoId`, `repoIds`, `limit`, `view`, `includeDetails`
  - query: `view`, `includeDetails`
- Response:
  - `data.sourceMode`
  - `data.analysisSource`: compact source summary
  - `data.matches[]` compact by default:
    - `roleId`, `roleName`, `matchScore`, `matchLevel`, `matchLevelLabel`
    - `matchedSkillNames[]`, `weakSkillNames[]`, `missingSkillNames[]`, `recommendedNextSkills[]`
  - detail mode:
    - `matchedSkills[]`, `weakSkills[]`, `missingRequiredSkills[]`, `missingOptionalSkills[]`, `recommendedNextSkills[]`
- Can giu:
  - `matches`, `roleId`, `roleName`, `matchScore`, `matchLevel`, `matchLevelLabel`
  - `matchedSkillNames`, `weakSkillNames`, `missingSkillNames`, `recommendedNextSkills`
- Optional:
  - `probability`, `rank`, `modelVersion`, `classifier`, `vectorSources`, `skillSimilarityThresholds`.
  - Nen map Logistic Regression probability vao `matchScore = probability * 100` de FE khong doi.

### `GET /api/analysis/repositories/:repoId/role-matches`

- Route/controller/service/model:
  - `analysis.routes.js`
  - `analysis.controller.js#getRepositoryRoleMatches`
  - `analysis.service.js#getRepositoryRoleMatches`
  - `roleMatching.service.js`
  - `AnalysisResult`
- Params/query/body:
  - params: `repoId`
  - query: `limit`, `targetRole`, `includeDetails`
- Response:
  - `data.repositoryId`, `repoName`, `fullName`, `analyzedAt`
  - `data.topRole`: `roleId`, `roleName`, `matchScore`, `matchLevel`, `matchLevelLabel`
  - `data.matches[]`: compact or detailed role match object from `roleMatching.service`
- Can giu:
  - `topRole`, `matches` va tat ca field compact.
- Optional:
  - Same as POST role-matches. Endpoint nay nen legacy-compatible wrapper goi inference moi.

### `GET /api/roles/catalog`

- Route/controller/service:
  - `src/routes/role.routes.js`
  - `src/controllers/role.controller.js#getCatalog`
  - `src/constants/roleSkillVectors.js`
- Params/body: none.
- Response:
  - `data.total`
  - `data.roles[]`: `roleId`, `roleName`, `description`, `category`, `level`, `requiredSkillCount`, `optionalSkillCount`
- Can giu:
  - `total`, `roles`, `roleId`, `roleName`.
- Optional:
  - `modelRoleLabel`, `prototypeVersion`, `isSupportedByModel`.
- Can doi noi dung:
  - Catalog rut con 5 role: Backend, Frontend, Mobile, DevOps, Data Scientist.

### `GET /api/skills/catalog`

- Route/controller/service:
  - `src/routes/skill.routes.js`
  - `src/controllers/skill.controller.js#getCatalog`
  - `src/utils/skillCanonicalizer.js`
  - `src/constants/canonicalSkills.js`
- Params/body: none.
- Response:
  - `data.total`
  - `data.skills[]`: tu `listCanonicalSkills()`, gom `name`, `category`, `aliases`, `defaultLevel`, `tags`.
- Can giu:
  - `total`, `skills`, `name`, `category`, `aliases`.
- Optional:
  - `prototypeVectorAvailable`, `prototypeVersion`, `roleTags`.
- Can doi noi dung:
  - Giam catalog ve skill roadmap can cho 5 role, van giu canonical/alias.

### `POST /api/roadmaps/generate`

- Route/controller/service/model:
  - `src/routes/roadmap.routes.js`
  - `src/controllers/roadmap.controller.js#generateRoadmap`
  - `src/services/roadmap.service.js#generateRoadmap`
  - `analysisSource.service`
  - `roadmapSkillGap.service`
  - `roleMatching.service`
  - `ai.service`, `ai/roadmap.prompt.js`
  - `Roadmap`, `Repository`, `RepositoryPackage`, `AnalysisSnapshot`, `SkillSignal`, `AiFeedback`
- Body:
  - `targetRole` required by validator
  - `sourceMode`, `repoId`, `repoIds`, `roleId`, `level`, `durationWeeks`, `language`, `useRoleMatching`, `forceRegenerate`
- Response `data`:
  - `roadmapId`, `title`, `targetRole`, `roleId`, `requestedLevel`, `effectiveLevel`, `durationWeeks`, `language`
  - `roadmapSource`
  - `roleMatch`
  - `skillGapSummary[]`
  - `mainRoadmap`, `alternativeRoadmaps`, `progressSummary`, `createdAt`, `updatedAt`
- Can giu:
  - Tat ca field response tren.
  - Trong task: `itemId`, `title`, `description`, `skillName`, `canonicalSkillName`, `category`, `targetRole`, `level`, `priority`, `week`, `estimatedHours`, `status`.
- Optional:
  - `roleMatch.probability`, `skillGapSummary[].similarity`, `roadmapSource.modelVersion`.

### `GET /api/roadmaps/:roadmapId`

- Route/controller/service/model:
  - `roadmap.routes.js`
  - `roadmap.controller.js#getRoadmapDetail`
  - `roadmap.service.js#getRoadmapById`
  - `Roadmap`
- Params:
  - `roadmapId`
- Response:
  - `data.roadmap` = same compact `GeneratedRoadmapResponse`.
- Can giu:
  - `data.roadmap` wrapper.
- Optional:
  - Same roadmap optional metadata.

### `GET /api/admin/analysis`

- Route/controller/service/model:
  - `admin.routes.js`
  - `admin.controller.js#getAnalysis`
  - `admin.service.js#getAnalysis`
  - `AnalysisSnapshot`
- Query:
  - `page`, `limit`, `search`
- Response:
  - `data.items[]`: raw analysis snapshot records with populated `userId`, `repositoryId`
  - `data.pagination.page`, `limit`, `total`, `totalPages`
- Can giu:
  - `items`, `pagination`, raw analysis fields.
- Optional:
  - Include `modelVersion`, `vectorSources`, `sourceStats`, `rolePredictions` in raw stored doc.

### `GET /api/admin/analysis/:analysisId`

- Route/controller/service/model:
  - `admin.routes.js`
  - `admin.controller.js#getAnalysisById`
  - `admin.service.js#getAnalysisById`
  - `AnalysisSnapshot`
- Params:
  - `analysisId`
- Response:
  - `data.analysis`: full raw analysis snapshot, populated `userId`, `repositoryId`.
- Can giu:
  - `data.analysis`.
- Optional:
  - Full Dev2Vec debug metadata; admin chi xem status/model, khong train.

## 2. Hard-code Hien Tai Can Bo

| Nhom | File/function | Field/logic bi anh huong | Huong thay |
|---|---|---|---|
| Skill weight | `src/services/skillVector.service.js#PACKAGE_SKILLS`, `createEvidence`, `buildConfigEvidence`, `buildChecklistEvidence` | `weight`, `confidence`, package/config/checklist signals | Bo lam scoring chinh. Chi giu extractor text/source stats neu can tao document. |
| Role weight/min score | `src/constants/roleSkillVectors.js` | `requiredSkills[].weight`, `minScore`, `importance`, `optionalSkills` | Catalog 5 role chi dung metadata/roadmap, khong tinh match score. |
| Scoring formula | `src/services/roleMatching.service.js#calculateRoleMatch` | `requiredScoreRaw * 0.7 + optionalScoreRaw * 0.15 + coverageRaw * 0.15` | Logistic Regression probability tu Python service. |
| Match threshold | `roleMatching.service.js#getMatchLevel` | 85/70/50/30 | Co the giu label mapping tren probability*100 de FE on dinh, nhung khong con la rule scoring. |
| Matched/weak/missing | `roleMatching.service.js#calculateRoleMatch` | `userScore >= requiredMinScore`, `userScore > 0`, optional/required split | Doi sang skill prototype vector + cosine similarity. |
| Next skills | `roleMatching.service.js#NEXT_SKILL_PRIORITY`, `getRecommendedNextSkills` | Thu tu uu tien hard-code | Doi sang top skill gaps theo role prototype/cosine + roadmap policy nhe. |
| Skill level threshold | `skillVector.service.js#getSkillLevel`, `roleMatching.service.js#getLevel` | 0/0.4/0.7 | Neu con tra `level`, derive tu similarity/probability hoac de compatibility only. |
| Keyword detection | `analysis.scoring.js` | `DATABASE_KEYWORDS`, `AUTH_KEYWORDS`, `FRAMEWORK_KEYWORDS`, `API_DOCS_KEYWORDS`, `DEPLOYMENT_KEYWORDS`, `TESTING_KEYWORDS`, `LINT_FORMAT_KEYWORDS` | Khong dung tinh role; co the giu source stats/debug. |
| Project/career rules | `analysis.engine.js#inferProjectType`, `inferCareerDirection`, `analysis.rules.js#careerDirectionRules`, `projectTypeRules` | Career direction hard-code | Doi `summary.careerDirection` theo top prediction hoac giu fallback khi model unavailable. |
| Missing skills | `analysis.engine.js#buildMissingSkills`, `buildRecommendations`, manual testing/deployment/doc checks | `missingSkills`, `recommendations`, `weaknesses` | Doi missing skill tu prototype similarity; recommendations theo gap moi. |
| Readiness/confidence | `analysis.engine.js#calculateUserReadiness`, `calculateContributionScore`, `calculateUserCommitQualityScore`, `calculateMissingCriticalPenalty` | `summary.userReadinessScore`, `summary.confidence`, `scoreBreakdown` | Giu field, tinh theo probability/source coverage hoac legacy-compatible heuristic nhe. |
| Analysis scores | `analysis.scoring.js#calculateAnalysisScores` | `techStackScore`, `documentationScore`, `overallScore` | Khong dung cho role; co the de portfolio metrics hoac replace bang vector/source stats. |
| Commit rules | `analysis.rules.js#commitRules`, `analysis.commitAnalyzer.js` | vague/conventional thresholds | Khong dung role; giu lam source quality stats neu can. |
| Roadmap gap | `roadmapSkillGap.service.js#buildRoadmapSkillPriorities`, `buildFallbackGap`, `buildRoadmapSkillGapFromAnalysis` | missingRequired/weak/recommended tu role matching cu | Doi input sang role prediction + skill prototype similarity gaps. |
| Roadmap role alias | `roadmapSkillGap.service.js#selectRoleMatchForRoadmap` | aliases `devops beginner`, `ai / machine learning beginner` | Cap nhat 5 role, bo AI Engineer/Fullstack. |
| Roadmap fallback templates | `roadmap.service.js#buildRolePhases`, `buildFallbackRoadmap` | Fullstack/AI templates va skill tags hard-code | Rut ve 5 role demo. |

## 3. GitHub Data Audit Cho Dev2Vec

| Data | Hien co | File/model | Dung cho |
|---|---|---|---|
| Repo name/fullName/description/topics/language/defaultBranch/size/stars/forks/openIssues | Co | `Repository.js`, `github.repository.service.js` | `dev2vec:Repos` tot. |
| README | Chi fetch `README.md`, luu `contentPreview` 200 chars va raw GitHub metadata, khong luu full decoded content | `github.package.service.js` | `dev2vec:Repos` dung kem; nen luu full/truncated text rieng. |
| Packages/dependencies/scripts/frameworks/configs | Co cho `package.json`, `requirements.txt`, `pyproject.toml`, `Pipfile`, `pom.xml`, `build.gradle`, `pubspec.yaml`, Docker, env, workflows | `RepositoryPackage.js`, `github.parser.service.js` | `dev2vec:Repos` va `dev2vec:APIs` qua dependency/import hints. |
| Commit history | Co sha/message/author/date/url; stats neu `includeStats=true` | `RepositoryCommit.js`, `github.commit.service.js` | `dev2vec:Repos` useful, source ownership/filter. |
| Commit diff/changed files | Co filename/status/additions/deletions/changes, khong co patch diff text | `RepositoryCommit.files` | `dev2vec:Repos` file path features; chua du cho code semantic. |
| Source files/imports | Chua fetch source tree/source file content/imports | Khong co model rieng | Can them extractor cho `dev2vec:APIs` de parse imports/routes/controllers/API signatures. |
| Issues | Chi co `openIssuesCount`, khong fetch issue title/body/comment/labels | `Repository.openIssuesCount` | Chua du cho `dev2vec:Issues`; can them model/fetcher. |
| Cached analysis | Co `AnalysisResult` va `RepoAnalysisSnapshot` luu languages/frameworks/packages/configs/skillVector/rawAnalysis | `AnalysisResult.js`, `RepoAnalysisSnapshot.js` | Dung transition/debug; khong nen lam source duy nhat cho doc2vec. |

Danh gia:

- `repoVector 230`: co nen build tu repo metadata, README, package/config, languages, commit messages, changed file paths.
- `issueVector 150`: hien tai thieu. Neu khong fetch issues thi dung zero vector theo design.
- `apiVector 200`: hien tai thieu source/import/API extraction. Tam dung dependencies/configs zero/fallback, nhung dung demo tot hon neu them source file scanner.
- `combinedVector 580`: concat `[repoVector, issueVector, apiVector]`; source nao thieu thi zero vector.

## 4. Roadmap Flow Audit

Roadmap hien lay role/skill gap tu:

1. `roadmap.service.js#generateRoadmap` resolve analysis source.
2. Neu `analysisForGap.skillVector` co data va `useRoleMatching !== false`, goi `roadmapSkillGap.service.js#buildRoadmapSkillGapFromAnalysis`.
3. `roadmapSkillGap.service.js` goi `roleMatching.service.js#matchSkillVectorToRoles`.
4. Skill gap lay tu `missingRequiredSkills`, `weakSkills`, `recommendedNextSkills`, fallback `analysis.missingSkills`.
5. `roadmap.service.js#applyRoadmapSkillGapPriorities` dua priority skills vao phase/task.
6. `roadmap.service.js#formatGeneratedRoadmapResponse` tra compact `roleMatch`, `skillGapSummary`, `mainRoadmap`, `alternativeRoadmaps`.

Field bat buoc giu:

- Request: `targetRole`, `roleId`, `sourceMode`, `repoId`, `repoIds`, `level`, `durationWeeks`, `language`, `useRoleMatching`, `forceRegenerate`.
- Response: `roadmapId`, `title`, `targetRole`, `roleId`, `requestedLevel`, `effectiveLevel`, `durationWeeks`, `language`, `roadmapSource`, `roleMatch`, `skillGapSummary`, `mainRoadmap`, `alternativeRoadmaps`, `progressSummary`.
- Task: `itemId`, `skillName`, `canonicalSkillName`, `targetRole`, `level`, `priority`, `week`, `status`.

Learning API usage:

- `roadmapLearning.service.js#buildLearningQueryFromTask` builds:
  - `skillName = task.canonicalSkillName`
  - `canonicalSkillName = task.canonicalSkillName`
  - `targetRole = task.targetRole || roadmap.targetRole`
  - `level = task.level || roadmap.effectiveLevel || beginner`
  - `language = roadmap.language || vi`
- `learning.service.js#buildLearningIdentity` canonicalizes `skillName`, stores/query by `normalizedSkillName`, `normalizedTargetRole`, `level`, `language`.
- Vi vay khi Dev2Vec doi scoring, chi can dam bao roadmap task van co canonical skill names.

Sua toi thieu:

- Thay implementation cua `roleMatching.service.js` bang adapter goi inference hoac doc2vec result loader, van tra object cu.
- Sua `roadmapSkillGap.service.js` de nhan `matched/weak/missing` moi tu cosine prototype, hoac giu interface role match detail.
- Sua `analysisSource.service.js#mergeUserContributionAnalyses` de gom developer document/vector thay vi max/avg skill score cu.

## 5. DB Schema Audit

Nen luu:

- `AnalysisResult` / collection `analysissnapshots`:
  - Them `repoVector: [Number]` length 230.
  - Them `issueVector: [Number]` length 150.
  - Them `apiVector: [Number]` length 200.
  - Them `combinedVector: [Number]` length 580.
  - Them `rolePredictions[]`: `{ roleId, roleName, probability, rank, modelVersion }`.
  - Them `modelVersion`, `vectorSources`, `sourceStats`.
  - Ly do: cac endpoint analysis/role/roadmap deu doc latest `AnalysisResult`.
- `RepoAnalysisSnapshot`:
  - Mirror nhung field tren neu snapshot/history can compare/debug.
  - Neu lo 512MB, chi luu metadata + predictions, khong mirror vectors day du.
- Model moi optional:
  - `DeveloperVectorCache`: theo user + selected repository set hash. Luu vector/predictions cho multi-repo selection de tranh nhan ban trong `AnalysisResult`.
  - `Dev2VecModelStatus`: modelVersion, trainedAt, roles, vectorDims, artifact paths/checksum, service status.

MongoDB Atlas Free 512MB rui ro:

- 580 floats neu Mongo Number double: khoang 4.6KB raw/doc, thuc te BSON overhead lon hon.
- Moi analysis snapshot luu ca `rawAnalysis`, `skillEvidence`, `skillVector`, vectors se phinh nhanh.
- `RepositoryCommit.rawData` co the rat lon neu include detail.
- `RepositoryPackage.rawData` luu GitHub content metadata; README/source full text se tang size.
- Khuyen nghi demo:
  - Luu vectors rounded float32-like 4 decimals hoac binary/base64 artifact if needed.
  - Chi luu latest vector trong `AnalysisResult`, snapshot chi metadata/predictions.
  - Gioi han commit detail/source content, strip `rawData` patch/content.
  - TTL/cleanup old analysis snapshots neu demo nhieu user.

## 6. Deploy And Project Structure Audit

- Backend start:
  - `server.js` load dotenv, connect Mongo, listen `PORT || 5000`.
  - `src/app.js` mount routes, Swagger `/api/swagger`, health `/health` va `/api/health`.
- `package.json` scripts:
  - `dev`: `nodemon server.js`
  - `start`: `node server.js`
  - Docker helpers va script tests rieng.
- Docker:
  - `Dockerfile` Node 20 alpine, `npm install --omit=dev`, `npm start`.
  - `docker-compose.yml` co `api` + local Mongo.
- Render:
  - Khong co `render.yaml`/`render.yml`.

Tich hop Python service nhe nhat voi Render Free:

- Demo/offline training:
  - Them folder `ml_service/`.
  - Train local/offline, commit artifacts nho vao `ml_service/artifacts/` neu dung duoc size repo, hoac upload artifact rieng.
- Production inference nhe:
  - Option A, easiest Render Free: Node backend spawn Python script per inference via `child_process` voi artifact local. It network-free, mot service duy nhat, cold start don gian.
  - Option B: Python FastAPI service rieng tren Render Free. Sach hon nhung them service/cold start/network config.
  - Khuyen nghi: Option A cho demo, sau do tach FastAPI khi production.
- File/folder nen them:
  - `ml_service/requirements.txt`
  - `ml_service/train.py`
  - `ml_service/infer.py`
  - `ml_service/extractors/repo_document.py`
  - `ml_service/extractors/issues_document.py`
  - `ml_service/extractors/api_document.py`
  - `ml_service/artifacts/doc2vec_repo.model`
  - `ml_service/artifacts/doc2vec_issue.model`
  - `ml_service/artifacts/doc2vec_api.model`
  - `ml_service/artifacts/role_classifier.joblib`
  - `ml_service/artifacts/skill_prototypes.json`
  - `src/services/dev2vec/dev2vec.service.js`
  - `src/services/dev2vec/dev2vecStatus.service.js`

## 7. Swagger Audit

- Swagger config: `src/config/swagger.js`
- Docs source: JSDoc inline trong `src/routes/*.js`
- Swagger UI: `src/app.js` mount `/api/swagger`

Can update:

- `src/routes/analysis.routes.js`
  - Mo ta `AnalysisResponse.summary.confidence` khong con hard-code confidence.
  - Them optional `modelVersion`, `vectorSources`, `sourceStats`, `rolePredictions`.
  - Role match schema them optional `probability`.
- `src/routes/role.routes.js`
  - Catalog 5 role moi.
- `src/routes/skill.routes.js`
  - Skill catalog prototype-ready.
- `src/routes/roadmap.routes.js`
  - `roleMatch` va `skillGapSummary` mo ta Dev2Vec/prototype similarity.
- `src/routes/admin.routes.js`
  - Admin analysis docs mo ta model status fields.
  - Them `GET /api/admin/dev2vec/status` tai cung file sau `router.use(authMiddleware, adminMiddleware)`.

Endpoint admin status de xuat:

```http
GET /api/admin/dev2vec/status
```

Response optional:

```json
{
  "status": "ready",
  "modelVersion": "dev2vec-demo-2026-07",
  "roles": ["Backend", "Frontend", "Mobile", "DevOps", "Data Scientist"],
  "vectorDims": { "repo": 230, "issue": 150, "api": 200, "combined": 580 },
  "trainedAt": "2026-07-05T00:00:00.000Z",
  "artifacts": { "classifier": true, "doc2vec": true, "skillPrototypes": true }
}
```

## 8. Phase Plan

### Phase 1: dataset/extractor/Python offline

- Tao `ml_service`.
- Chuan hoa 5 role labels: `backend`, `frontend`, `mobile`, `devops`, `data_scientist`.
- Dataset developer-level, moi role khoang 15 samples.
- Build developer document tu multi repo:
  - Repo doc: metadata, README, packages, languages, commit messages, changed files.
  - Issue doc: issue title/body/labels/comments; neu thieu zero vector.
  - API doc: imports/routes/controllers/API signatures; neu thieu zero vector.
- Train 3 Doc2Vec models + Logistic Regression offline.
- Export skill prototype vectors.

### Phase 2: inference service va model status

- Them Node adapter `dev2vec.service.js`.
- Load model metadata/status.
- Them `GET /api/admin/dev2vec/status`.
- Them env:
  - `DEV2VEC_MODE=local_python|disabled`
  - `DEV2VEC_MODEL_VERSION`
  - `PYTHON_PATH`
- Chua doi FE contract.

### Phase 3: thay role match, giu response field

- Sua `roleMatching.service.js` hoac tao `dev2vecRoleMatching.service.js`.
- Input: selected repo analyses/source documents.
- Output top 3 role:
  - `roleId`, `roleName`, `probability`
  - map `matchScore = probability * 100`
  - giu `matchLevel`, `matchLevelLabel`.
- `POST /api/analysis/role-matches` va legacy GET cung goi logic moi.
- Luu `rolePredictions` trong `AnalysisResult` hoac cache multi-repo.

### Phase 4: thay skill gap bang prototype vector

- Tao service `skillPrototype.service.js`.
- `matchedSkillNames`, `weakSkillNames`, `missingSkillNames` tinh bang cosine similarity giua combined vector va skill prototype.
- Giu ten field:
  - `matchedSkillNames`
  - `weakSkillNames`
  - `missingSkillNames`
  - `recommendedNextSkills`
- Detail arrays co the them `similarity`, `threshold`, `source='skill_prototype'`.

### Phase 5: noi roadmap voi skill gap moi

- Sua `roadmapSkillGap.service.js` de dung skill gap moi.
- Giu `formatSkillGapSummary` output.
- Prompt roadmap van nhan `skillGapSummary`, `prioritySkills`, `roleMatch`.
- Learning khong can doi neu task van co `canonicalSkillName`.

### Phase 6: cleanup hard-code cu

- Rut `ROLE_SKILL_VECTORS` ve 5 role metadata.
- Giam `CANONICAL_SKILLS` ve catalog roadmap/prototype can thiet.
- Decommission:
  - `analysis.scoring.js` role-related use.
  - `analysis.rules.js` careerDirection/scoreWeights cho role.
  - `skillVector.service.js` weight/confidence scoring.
  - `roleMatching.service.js` weighted formula.
- Giu extractor nao con dung cho document/source stats.

## 9. Final Endpoint Migration Table

| Endpoint | Giu nguyen hay them moi | Field giu nguyen | Field doi cach tinh | File can sua | Rui ro FE |
|---|---|---|---|---|---|
| `POST /api/analysis/repositories/:repoId` | Giu nguyen | `analysisId`, `repository`, `analysisScope`, `summary`, `topSkills`, `missingSkills`, `strengths`, `weaknesses`, `recommendations` | `summary.careerDirection`, `confidence`, `topSkills`, `missingSkills`, `recommendations` | `analysis.service.js`, `analysis.engine.js`, `AnalysisResult.js`, Dev2Vec adapter | Thap neu field ten/cu kieu du lieu giu. |
| `GET /api/analysis/results/:repoId` | Giu nguyen | `data.analysis` va analysis fields | Same analysis fields | Same tren | Thap. |
| `GET /api/analysis/me` | Giu nguyen | `total`, `analyses[]`, compact fields | `summary`, `topSkills`, `missingSkills` | Same tren | Thap. |
| `POST /api/analysis/role-matches` | Giu nguyen | `sourceMode`, `analysisSource`, `matches`, `roleId`, `roleName`, `matchScore`, `matchLevel`, `matchedSkillNames`, `weakSkillNames`, `missingSkillNames`, `recommendedNextSkills` | `matchScore`, `matchLevel`, skill name arrays | `analysis.service.js`, `roleMatching.service.js`, `analysisSource.service.js`, new Dev2Vec service | Thap-vua; FE co the dang ky vong `limit=5`, design moi top 3. Nen van chap nhan `limit` nhung default 3. |
| `GET /api/analysis/repositories/:repoId/role-matches` | Giu legacy | `repositoryId`, `repoName`, `fullName`, `analyzedAt`, `topRole`, `matches` | `topRole.matchScore`, `matches[]` | Same role matching files | Thap. |
| `GET /api/roles/catalog` | Giu nguyen | `total`, `roles[]`, `roleId`, `roleName`, `description`, `category`, `level`, counts | Counts/catalog content | `roleSkillVectors.js`, `role.controller.js` optional | Vua neu FE hard-code Fullstack/AI; can thong bao catalog chi 5 role. |
| `GET /api/skills/catalog` | Giu nguyen | `total`, `skills[]`, `name`, `category`, `aliases`, `defaultLevel`, `tags` | Catalog content/prototype flags | `canonicalSkills.js`, `skillCanonicalizer.js` | Vua neu FE filter theo skill cu bi xoa. Nen giu alias/backward-compatible names neu co roadmap cu. |
| `POST /api/roadmaps/generate` | Giu nguyen | Request fields, response `roadmapId`, `targetRole`, `roleId`, `effectiveLevel`, `roadmapSource`, `roleMatch`, `skillGapSummary`, `mainRoadmap`, `alternativeRoadmaps`, `progressSummary` | `roleMatch`, `skillGapSummary`, task skill priority | `roadmap.service.js`, `roadmapSkillGap.service.js`, `roleMatching.service.js` | Thap neu task fields giu. |
| `GET /api/roadmaps/:roadmapId` | Giu nguyen | `data.roadmap` va compact roadmap fields | `roleMatch`, `skillGapSummary` | `roadmap.service.js` | Thap. |
| `GET /api/admin/analysis` | Giu nguyen | `items`, `pagination` | Raw item co them model fields | `admin.service.js`, `AnalysisResult.js`/`AnalysisSnapshot.js` | Thap; admin FE can ignore optional. |
| `GET /api/admin/analysis/:analysisId` | Giu nguyen | `data.analysis` | Raw analysis model fields | Same tren | Thap. |
| `GET /api/admin/dev2vec/status` | Them moi | N/A | N/A | `admin.routes.js`, `admin.controller.js`, `admin.service.js`, `dev2vecStatus.service.js`, Swagger | Khong rui ro FE vi optional/new. |

## 10. Ket Luan

Huong migration it pha FE nhat la giu tat ca endpoint va response field hien tai, chi thay computation layer:

- `matchScore` tro thanh `probability * 100`.
- `matchedSkillNames`, `weakSkillNames`, `missingSkillNames`, `recommendedNextSkills` tro thanh ket qua cosine similarity voi skill prototypes.
- `roleMatch` va `skillGapSummary` trong roadmap giu schema, doi nguon tinh.
- Admin chi them status endpoint, khong them train web flow.

Rui ro lon nhat khong nam o API contract ma o data source: hien chua co issue text va source/import extraction day du. Theo design da chot, co the zero-vector nguon thieu de demo chay duoc, nhung nen them issue/API extractor som de model co tin hieu tot hon.
