# Dev2Vec Phase 9 Cleanup Report

## Scope

Phase 9 audited the main API paths after Dev2Vec integration:

- `POST /api/analysis/repositories/:repoId`
- `GET /api/analysis/results/:repoId`
- `GET /api/analysis/me`
- `POST /api/analysis/role-matches`
- `GET /api/analysis/repositories/:repoId/role-matches`
- `POST /api/roadmaps/generate`
- `GET /api/roles/catalog`
- `GET /api/skills/catalog`

The cleanup keeps legacy files where other non-main helpers still import them, but prevents weighted role scoring and hard-coded role IDs from being used in the Dev2Vec paths.

## Files Changed

- `src/services/roleMatching.service.js`
  - Added a deprecation header. This legacy weighted role matcher is not used by Dev2Vec analysis, role-matches, or roadmap generation.
- `src/services/skillVector.service.js`
  - Added a deprecation header. Legacy package/config skill weights are not used by Dev2Vec analysis, role-matches, or roadmap generation.
- `docs/DEV2VEC_PHASE9_CLEANUP_REPORT.md`
  - Added this audit and cleanup report.

Recent Dev2Vec cleanup already in place from phases 5-8:

- `src/services/analysis.service.js`
- `src/services/dev2vec/dev2vec.service.js`
- `src/services/dev2vec/dev2vecInputBuilder.service.js`
- `src/services/dev2vec/dev2vecRoleMapper.service.js`
- `src/services/roadmap.service.js`
- `src/services/roadmapSkillGap.service.js`
- `src/constants/dev2vecCatalog.js`
- `src/controllers/role.controller.js`
- `src/controllers/skill.controller.js`
- `src/routes/analysis.routes.js`
- `src/routes/roadmap.routes.js`
- `src/routes/role.routes.js`
- `src/routes/skill.routes.js`

## Main Path Status

### Analysis

`POST /api/analysis/repositories/:repoId` now uses:

- `buildDev2VecInputFromRepositoryAnalysis`
- `runDev2VecInference`
- `buildAnalysisSummaryFromDev2Vec`
- `buildAnalysisSkillsFromDev2Vec`

The legacy `buildAnalysisPayload` path still exists in `analysis.engine.js` for compatibility, but it is not imported by `analysis.service.js` for the main analyze endpoint.

### Role Matches

`POST /api/analysis/role-matches` and `GET /api/analysis/repositories/:repoId/role-matches` now use:

- cached `AnalysisResult.dev2vec` when available
- `runDev2VecInference` only when cache is missing or multi-repo input must be built
- `mapDev2VecOutputToRoleMatches`

These paths do not import or call:

- `matchSkillVectorToRoles`
- `calculateRoleMatch`
- `ROLE_SKILL_VECTORS`
- `NEXT_SKILL_PRIORITY`
- `requiredScoreRaw / optionalScoreRaw / coverageRaw`

### Roadmap

`POST /api/roadmaps/generate` now uses:

- Dev2Vec role matches
- Dev2Vec `skillGaps[resolvedRoleId]`
- Dev2Vec `skillGapSummary`

The main roadmap task post-processing enforces main roadmap task skills to stay inside Dev2Vec skill gaps.

### Catalogs

`GET /api/roles/catalog` returns only:

- `backend`
- `frontend`
- `mobile`
- `devops`
- `data_scientist`

`GET /api/skills/catalog` returns the 25 Dev2Vec skill prototype skills from `src/constants/dev2vecCatalog.js`.

## Deprecated But Kept

The following legacy files/functions are intentionally kept because other older helpers/tests still import them:

- `src/constants/roleSkillVectors.js`
  - Deprecated legacy weighted role vector metadata.
  - Contains old role IDs such as `backend-developer`, `frontend-developer`, `fullstack-developer`, `devops-engineer`, `mobile-developer`, `ai-engineer`.
  - Not used by Dev2Vec role-matches, roadmap generation, or role catalog.
- `src/services/roleMatching.service.js`
  - Deprecated legacy weighted role scoring.
  - Still exports `matchSkillVectorToRoles` and `calculateRoleMatch` for backward compatibility.
  - Not used by main analysis role-matches or roadmap generation.
- `src/services/skillVector.service.js`
  - Deprecated legacy package/config evidence weighting.
  - Not used by the Dev2Vec analysis/role-match/roadmap path.
- `src/services/chatSkillContext.service.js`
  - Still imports `matchSkillVectorToRoles` for chat context role hints. This is outside the requested main API path list.

## Alias Compatibility Kept

Old role aliases are kept for request normalization only:

- `backend-developer -> backend`
- `frontend-developer -> frontend`
- `mobile-developer -> mobile`
- `devops-engineer -> devops`
- `data-scientist -> data_scientist`
- `fullstack-developer -> backend`
- `ai-engineer -> data_scientist`

These aliases are not returned by role catalog or Dev2Vec role-match responses.

## API Test Checklist

Manual API checks to run with an authenticated request:

1. `GET /api/admin/dev2vec/status`
   - Expected: Dev2Vec artifacts ready.

2. `POST /api/analysis/repositories/:repoId?view=detail&includeEvidence=true`
   - Expected:
     - `scoreBreakdown.scoringMethod = dev2vec_doc2vec_classifier`
     - `debug.dev2vec.rolePredictions[].roleId` uses only Dev2Vec role IDs.
     - No `backend-developer`, `fullstack-developer`, or `ai-engineer`.

3. `POST /api/analysis/role-matches`
   ```json
   {
     "sourceMode": "single_repo",
     "repoId": "...",
     "limit": 5
   }
   ```
   - Expected:
     - max 3 matches
     - role IDs only from `backend`, `frontend`, `mobile`, `devops`, `data_scientist`
     - `scoringMethod = dev2vec_doc2vec_classifier`

4. `GET /api/analysis/repositories/:repoId/role-matches`
   - Expected: same role ID/scoring constraints as POST role-matches.

5. `POST /api/roadmaps/generate`
   ```json
   {
     "targetRole": "Backend Developer",
     "roleId": "backend",
     "level": "beginner",
     "durationWeeks": 6,
     "language": "vi",
     "useRoleMatching": true,
     "forceRegenerate": true,
     "sourceMode": "single_repo",
     "repoId": "..."
   }
   ```
   - Expected:
     - `roleId = backend`
     - `roleMatch.scoringMethod = dev2vec_doc2vec_classifier`
     - `skillGapSummary[].source = dev2vec`
     - no fullstack/AI legacy role in `roleMatch`

6. `GET /api/roles/catalog`
   - Expected:
     - `total = 5`
     - role IDs: `backend`, `frontend`, `mobile`, `devops`, `data_scientist`

7. `GET /api/skills/catalog`
   - Expected:
     - Dev2Vec prototype skills are present
     - backend skills include `REST API`, `Database`, `Authentication`, `Docker Basics`, `API Testing`

## Automated Checks Run

These local require/smoke checks were run during cleanup:

```bash
node -e "require('./src/services/analysis.service'); require('./src/services/roadmap.service'); require('./src/controllers/role.controller'); require('./src/controllers/skill.controller'); require('./src/services/roleMatching.service'); require('./src/services/skillVector.service'); console.log('PASS: phase9 require check')"
node -e "const role=require('./src/controllers/role.controller'); const skill=require('./src/controllers/skill.controller'); function mock(){return {status(c){this.statusCode=c;return this},json(b){this.body=b;return this}}} const rr=mock(); role.getCatalog({},rr); const sr=mock(); skill.getCatalog({},sr); const result={rolesTotal:rr.body.data.total, roleIds:rr.body.data.roles.map(r=>r.roleId), skillsTotal:sr.body.data.total, backendSkills:sr.body.data.skills.slice(0,5).map(s=>s.name)}; console.log(JSON.stringify(result,null,2)); if(result.rolesTotal!==5 || result.skillsTotal!==25) process.exit(1);"
node scripts/testDev2VecRoleMapper.js
rg -n "ROLE_SKILL_VECTORS|matchSkillVectorToRoles|calculateRoleMatch|NEXT_SKILL_PRIORITY|requiredScoreRaw|optionalScoreRaw|coverageRaw|backend-developer|frontend-developer|fullstack-developer|ai-engineer" src/services/analysis.service.js src/services/roadmap.service.js src/routes/analysis.routes.js src/routes/roadmap.routes.js src/routes/role.routes.js src/routes/skill.routes.js src/controllers/role.controller.js src/controllers/skill.controller.js
```

## Risk Notes

- `roleMatching.service.js` and `roleSkillVectors.js` still contain old role IDs and weighted formulas by design. They are deprecated but retained for backward compatibility.
- `chatSkillContext.service.js` still uses legacy role matching for chat-only role hints. This is outside the phase 9 main API path list and should be handled separately if chat must also become Dev2Vec-only.
- `skillVector.service.js` still contains package/config weight logic for legacy evidence construction. It is not used in the Dev2Vec main analysis path.
