function safeJson(data) {
  try {
    return JSON.stringify(data || null, null, 2);
  } catch (error) {
    return 'null';
  }
}

function buildRoadmapPrompt({ targetRole, githubContext, roadmapGapContext }) {
  return `
You are an AI Career Mentor and Software Engineering curriculum designer.

Your task:
Generate a personalized learning roadmap for a Software Engineering student.

Important rules:
- The student selected this target role: ${targetRole}.
- The roadmap must prioritize the selected target role.
- This roadmap is based on the current user's own GitHub commits/contribution, not the whole repository.
- Use effectiveLevel from Roadmap Skill Gap Context as the student's actual level band. request level is only a fallback.
- Do not force the student to learn every missing skill.
- Build a main path that helps the student reach MVP competency for the selected target role.
- Use the student's GitHub analysis context as evidence.
- If the student's GitHub currently shows a different direction, mention it in currentGithubDirection and summary.
- Add 2 supporting paths:
  1. One path that reuses or extends the student's existing GitHub strengths.
  2. One path that improves job-readiness and employability.
- Do not invent repositories, technologies, or skills not present in the context.
- You may suggest missing skills only if they are relevant to the selected target role.
- If Roadmap Skill Gap Context is available, prioritize its prioritySkills in order.
- Do not make alreadyStrongSkills the main learning content.
- Every skill name must use the canonical name from Roadmap Skill Gap Context.
- mainPath phases and tasks must use only canonical skills from Roadmap Skill Gap Context skillGapSummary/skillGaps.
- Do not invent a new primary skillName or canonicalSkillName for mainPath tasks.
- If a task mentions Docker, Docker Compose, Dockerfile, containers, or deployment containers, set skillName/canonicalSkillName to Docker Basics when Docker Basics exists in skillGapSummary.
- If a task mentions Jest, Supertest, unit tests, integration tests, or API tests, set skillName/canonicalSkillName to API Testing when API Testing exists in skillGapSummary.
- If a task mentions MongoDB, Mongoose, schema design, indexes, queries, or data models, set skillName/canonicalSkillName to Database when Database exists in skillGapSummary.
- If a task mentions JWT, RBAC, refresh tokens, login, auth, or permissions, set skillName/canonicalSkillName to Authentication when Authentication exists in skillGapSummary.
- If a task mentions Swagger, OpenAPI, API endpoints, routes, controllers, CRUD, or REST, set skillName/canonicalSkillName to REST API when REST API exists in skillGapSummary.
- Do not duplicate canonical skills across priority gap items. Alternative paths must use different skills or clearly different objectives.
- Generate concise, actionable tasks.
- Do not include learning resource links, books, courses, videos, or documentation URLs.
- Set every task resources field to an empty array. Learning resources are handled by a separate Learning API.
- Each task should include itemId or taskId, skillName, canonicalSkillName, targetRole, level, priority, week, estimatedHours, and status when possible.
- Answer as valid JSON only.
- Do not wrap JSON in markdown.
- Use Vietnamese text for user-facing fields.

Return JSON with exactly this structure:
{
  "targetRole": "",
  "currentGithubDirection": "",
  "summary": "",
  "mainPath": {
    "title": "",
    "reason": "",
    "phases": [
      {
        "title": "",
        "goal": "",
        "skills": [],
        "tasks": [
          {
            "title": "",
            "description": "",
            "itemId": "",
            "skillName": "",
            "canonicalSkillName": "",
            "targetRole": "",
            "level": "",
            "priority": "medium",
            "week": 1,
            "skillTags": [],
            "status": "not_started",
            "estimatedHours": 0,
            "resources": [
              {
                "title": "",
                "type": "",
                "url": ""
              }
            ]
          }
        ]
      }
    ]
  },
  "supportingPaths": [
    {
      "title": "",
      "reason": "",
      "skills": [],
      "suggestedTasks": []
    },
    {
      "title": "",
      "reason": "",
      "skills": [],
      "suggestedTasks": []
    }
  ]
}

Constraints:
- mainPath should have 3 to 5 phases.
- Each phase should have 2 to 4 tasks.
- supportingPaths must contain exactly 2 items.
- Resources can be empty array if no reliable resource URL is available.
- Do not generate resource URLs inside roadmap tasks.
- Keep the roadmap practical for a student MVP.
- beginner: focus on fundamentals, clear explanations, and small projects.
- intermediate: focus on deeper practice, testing, refactor, basic CI/CD, and clean code.
- advanced: focus on architecture, security, performance, production, and monitoring.
- Use clear Vietnamese.

Student GitHub Context:
${safeJson(githubContext)}

Roadmap Skill Gap Context:
${safeJson(roadmapGapContext)}
`;
}

module.exports = {
  buildRoadmapPrompt,
};
