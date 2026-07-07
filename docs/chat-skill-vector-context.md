# Chat Skill Vector Context

## Overview

ChatAI now prioritizes skill score data from repository analysis instead of sending a long full GitHub context to Gemini.

The main source is:

- `AnalysisResult.skillVector`
- `RepoAnalysisSnapshot.skillVector`
- `SkillSignal`
- `missingSkills`, `weaknesses`, `strengths`, and `recommendations` from analysis snapshots

The older GitHub context is still available as secondary compact context, but skill questions use the filtered Skill Score Context first.

## Supported Intents

`detectChatIntent(userQuestion)` supports:

- `WEAK_SKILLS`
- `STRONG_SKILLS`
- `NEXT_SKILLS`
- `ROLE_FIT`
- `REPO_REVIEW`
- `GENERAL`
- `DETAIL_REQUEST`

Intent detection is keyword-based and intentionally simple. It runs only in `AI_AUTO` mode.

## Skill Score Context

`buildChatSkillScoreContext(userId, options)` builds a compact context filtered by `userId`.

It reads:

- latest `AnalysisResult` documents
- latest `RepoAnalysisSnapshot` documents
- `SkillSignal` documents
- `StudentProfile.targetCareer`

For each skill, it aggregates:

- `averageScore`
- `maxScore`
- `minScore`
- `repoCount`
- `evidenceCount`
- related repositories
- source flags such as `missing`, `recommended`, `weakSignal`, `strongSignal`

Score thresholds:

- weak: below 50 or marked missing/weak
- medium: 50-74
- strong: 75 or higher

## Weak, Strong, And Next Skills

Weak skills are sorted by lowest score first and include skills from:

- low skillVector score
- `missingSkills`
- `weaknesses`

Strong skills are sorted by highest score first and include:

- high skillVector score
- `strengths`

Next skills prioritize:

- missing skills
- recommended skills
- low score skills relevant to target career when available

## Role Fit

For `ROLE_FIT`, ChatAI uses the aggregated skill scores to build a merged skill vector and calls `roleMatching.service.js`.

The prompt receives at most 3 role matches. If there is not enough skill score data, ChatAI should answer that the data is insufficient.

## Response Style

The prompt now instructs Gemini to:

- answer briefly
- use 3-7 bullets by default
- avoid long mentor-style explanations
- avoid inventing skills, scores, repos, roles, or commits
- return `Hien chua du du lieu phan tich tu repo de xac dinh.` when skill score data is missing

Intent formats:

- `WEAK_SKILLS`: max 5-7 weak or missing skills
- `STRONG_SKILLS`: max 5 strong skills
- `NEXT_SKILLS`: max 3-5 next skills
- `ROLE_FIT`: max 3 matching roles
- `REPO_REVIEW`: 3-5 observations
- `DETAIL_REQUEST`: longer allowed, still structured

## Chat Admin Mode

Chat Admin Mode is unchanged.

- `MANUAL`: user message is saved, Gemini is not called, skill context is not built.
- `AI_AUTO`: user message is saved, intent is detected, skill score context is built, then Gemini is called.

## Dev Debug Response

When `NODE_ENV !== "production"`, `POST /api/chat/sessions/:sessionId/messages` may include:

```json
{
  "intent": "WEAK_SKILLS",
  "contextSource": "skillVector",
  "skillScoreSummary": {
    "totalSkills": 12,
    "weakCount": 4,
    "strongCount": 3
  }
}
```

These fields are additive and do not remove existing `userMessage`, `aiMessage`, or `assistantMessage`.

## Swagger Test Cases

Case 1:

```json
{ "message": "Toi dang yeu ky nang gi?" }
```

Expected in dev:

- `effectiveMode = "AI_AUTO"`
- `intent = "WEAK_SKILLS"`
- AI content only lists weak or missing skills

Case 2:

```json
{ "message": "Toi manh ky nang gi?" }
```

Expected:

- `intent = "STRONG_SKILLS"`
- AI content only lists strong skills

Case 3:

```json
{ "message": "Toi nen hoc gi tiep?" }
```

Expected:

- `intent = "NEXT_SKILLS"`
- AI content lists 3-5 priority skills

Case 4:

When global or session mode is `MANUAL`:

- Gemini is not called
- skill score context is not built
- response includes `adminMessage = null`
