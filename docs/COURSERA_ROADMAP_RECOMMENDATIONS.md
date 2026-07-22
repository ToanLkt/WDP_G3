# Coursera Offline Roadmap-Level Recommendations

## Scope

This feature recommends one flat list of Coursera courses for an entire roadmap. It never attaches courses to roadmap items. Runtime requests read MongoDB only and do not call Coursera, a search engine, YouTube, or Gemini.

The checked-in v1 seed contains 15 unique courses. All 15 direct public pages were resolved and reviewed on 2026-07-23; the crawl report records the validation result.

## Topic resolution

The catalog contains 15 deterministic topics: five current Dev2Vec role IDs (`backend`, `frontend`, `mobile`, `devops`, `data_scientist`) multiplied by the three persisted roadmap levels (`beginner`, `intermediate`, `advanced`). Resolution uses `roleId`, then `roleMatch.roleId`, then `targetRole`; level uses `effectiveLevel`, then `requestedLevel`, then legacy `level`. Missing/unknown level falls back to beginner.

Task skills are supporting relevance terms only. `itemId` and `taskId` are not read by the resolver or returned by the API.

## Offline catalog workflow

1. Review `data/coursera-roadmap-course-plan.json`.
2. Supply reviewed direct-page candidates to `scripts/crawlCourseraRoadmapCatalog.js` with `--input=...`. The script never constructs a slug from a title.
3. Optionally run the crawler with `--verify-remote` during an authorized offline refresh. It accepts only public HTTPS direct pages and rejects login, search, lecture, assignment, challenge and external URLs.
4. Run `node scripts/validateCourseraRoadmapSeed.js`.
5. Set `MONGO_URI` and run `node scripts/importCourseraRoadmapSeed.js`.

The importer upserts on the unique `canonicalUrl`. A course has one document and may contain multiple `roadmapTopicMappings`.

## Runtime API

`GET /api/roadmaps/{roadmapId}/course-recommendations`

The authenticated user must own the non-deleted roadmap. The response contains a topic and at most five deterministically ranked courses. A missing topic, empty catalog, or catalog query failure returns an empty `courses` array without affecting roadmap or YouTube APIs.

```json
{
  "success": true,
  "message": "Roadmap course recommendations fetched successfully",
  "data": {
    "roadmapId": "665f1f000000000000000001",
    "topic": {
      "topicId": "frontend-beginner",
      "roleId": "frontend",
      "level": "beginner",
      "displayName": "Frontend Development cơ bản"
    },
    "courses": [
      {
        "provider": "coursera",
        "title": "Meta Front-End Developer Professional Certificate",
        "url": "https://www.coursera.org/professional-certificates/meta-front-end-developer",
        "pricingType": "provider_determined",
        "linkType": "direct_course",
        "isExternal": true
      }
    ]
  }
}
```

## URL and ranking rules

Only `/learn/`, `/specializations/`, `/professional-certificates/`, and `/projects/` on `coursera.org`/`www.coursera.org` are accepted. Query strings and fragments are removed. Ranking starts with the offline topic mapping score and adds level, preferred content type, and whole-topic supporting-skill coverage. Ties use canonical URL, making output deterministic.

## Refresh policy

Provider pages may move or become unavailable. Refresh and revalidate the seed offline; do not schedule the crawler inside the API process. Pricing is provider-determined and must not be inferred from public copy.
