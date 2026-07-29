# Repository Analysis → Roadmap Flow

This document describes the current backend behavior that the Frontend should follow.

Current implementation is per repository.

```text
GitHub Repository
  ->
Repository Analysis
  ->
Role Prediction
  ->
User selects ONE predicted role
  ->
Create Roadmap
  ->
Roadmap is generated from the SAME analyzed repository
```

The backend may accept `repoIds` and `sourceMode=selected_repos`, but roadmap generation still resolves to one authoritative analysis and one authoritative repository for the actual roadmap source.

## Why roadmap is tied to one repository

The current implementation keeps one repository analysis as the source of truth for the roadmap because:

- the selected role comes from one repository analysis
- the skill gap is computed from that same analysis
- GitHub context is loaded from that same repository
- roadmap generation stays consistent with the analyzed evidence

This avoids mixing evidence across repositories and avoids producing a roadmap whose gap profile does not match the role prediction that the user selected.

```text
One repository analysis
  ->
One role prediction result
  ->
One roadmap source
  ->
One roadmap
```

## FE user flow

1. Analyze repository.
2. Show repository analysis.
3. Display predicted roles.
4. User clicks one role.
5. Navigate to Create Roadmap.
6. Repository should already be selected.
7. User only changes:
   - duration
   - language
   - optional preferences
8. User does not change repository.

## UI recommendations

Replace the ambiguous label `Select repositories` with one of these:

- `Repository`
- `Analysis Source`

Display these fields prominently:

- Repository Name
- Analysis Date
- Selected Role
- Analysis Score

That makes the provenance of the roadmap obvious to the user.

## Create Roadmap screen

The screen should show:

- Repository card
- Role card
- Duration
- Language
- Generate button

It should not show repository multi-select for this flow.

## Backend flow

### Repository analysis

Route:

- `POST /api/analysis/repositories/:repoId`

This endpoint creates the analysis snapshot that later powers role prediction and roadmap generation.

### Role prediction

Route:

- `POST /api/analysis/role-matches`

Current analysis service behavior:

- `single_repo` reuses one repository analysis
- `all_analyzed_repos` and `selected_repos` still resolve primary roles per repository
- the implementation returns one authoritative primary role candidate for roadmap use

Relevant response fields already include source provenance such as:

- `sourceRepositoryId`
- `sourceAnalysisId`
- `sourceSnapshotId`
- `matchScore`
- `roleId`
- `roleName`

### Roadmap creation

Route:

- `POST /api/roadmaps/generate`

Current service behavior:

- resolves one source analysis first
- validates that the selected role belongs to that same analysis
- sets one `sourceRepositoryId`
- sets one `sourceAnalysisId`
- loads GitHub context from one repository only
- stores one `repositoryId` in the `Roadmap` document

```text
Repository Analysis
  ->
Role Prediction
  ->
Selected Role
  ->
Roadmap service resolves one analysis
  ->
Roadmap source pinned to one repository
```

## API contract for FE

FE should send the following fields for roadmap generation:

- `selectedRoleId`
- `sourceRepositoryId`
- `sourceAnalysisId`
- `targetRole`
- `durationWeeks`
- `language`

Supporting fields that may still exist in the current API:

- `sourceMode`
- `repoId`
- `repoIds`
- `roleId`
- `currentRepositoryId`
- `useRoleMatching`
- `forceRegenerate`

The authoritative tuple is:

- `selectedRoleId`
- `sourceRepositoryId`
- `sourceAnalysisId`

These three must belong to the same repository analysis.

Recommended request shape:

```json
{
  "sourceMode": "single_repo",
  "selectedRoleId": "backend",
  "sourceRepositoryId": "REPOSITORY_ID",
  "sourceAnalysisId": "ANALYSIS_ID",
  "targetRole": "Backend Developer",
  "durationWeeks": 6,
  "language": "vi",
  "useRoleMatching": true
}
```

## Roadmap source model

The `Roadmap` model stores a single authoritative repository reference:

- `repositoryId`
- `targetRole`
- `roleId`
- `requestedLevel`
- `effectiveLevel`
- `durationWeeks`
- `language`
- `roadmapSource`
- `roleMatch`
- `skillGapSummary`

`roadmapSource` carries provenance for one source analysis, not a merged multi-repository roadmap source.

## Swagger and DTO inconsistency

Swagger currently describes broader options such as:

- `sourceMode=selected_repos`
- `repoIds[]`
- multi-repository language in the role-match and roadmap descriptions

However, the implementation still resolves one authoritative repository analysis for roadmap generation.

Frontend should follow the implementation, not the older broad wording in Swagger.

In practice this means:

- treat `repoIds[]` as legacy or source-selection input only
- do not assume multiple repositories are combined into one roadmap
- do not mix role provenance from one repository with a different roadmap source

## Things FE should not do

Do not:

- allow selecting another repository after a role has already been chosen
- allow multiple repositories for roadmap generation
- mix roles from one repository with another repository
- assume `repoIds[]` changes roadmap generation semantics

## UX rationale

This design is better because it is:

- predictable
- consistent
- aligned with the analyzed repository
- free of ambiguity in skill gaps
- easier for users to understand and trust

## Future extension

Optional future work only, not implemented now:

- portfolio-level analysis
- developer-level analysis
- merged repository analysis

These are not part of the current backend behavior.
