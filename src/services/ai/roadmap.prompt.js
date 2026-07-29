function safeJson(data) {
  try {
    return JSON.stringify(data || null, null, 2);
  } catch (error) {
    return 'null';
  }
}

function buildRoadmapPrompt({ targetRole, githubContext, roadmapGapContext }) {
  const durationWeeks = Number(roadmapGapContext?.durationWeeks || 6);
  return `
You are an AI Career Mentor and Software Engineering curriculum designer.

Your task:
Generate a personalized learning roadmap for a Software Engineering student.

Important rules:
- The student selected this target role: ${targetRole}.
- The student selected this duration: ${durationWeeks} weeks.
- The roadmap must prioritize the selected target role.
- AUTHORITATIVE_ROLE_AND_SKILL_GAP is the only section allowed to determine target role and roadmap skills.
- GENERAL_PROJECT_CONTEXT and package inventory may suggest examples only; packages do not prove personal skill.
- PRIOR_FEEDBACK_CONTEXT must not override the current role, classifier order, or Python skill status.
- Never add a main-path skill outside the authoritative gap.
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
- Generate exactly ${durationWeeks} weeks for the mainPath.
- Every week from 1 to ${durationWeeks} must have at least one mainPath task.
- Do not stop at 4 weeks when the requested duration is ${durationWeeks}.
- Task week values must be integers in range 1..${durationWeeks}.
- Do not make alreadyStrongSkills the main learning content.
- Do not treat topSkills/already detected skills as missing.
- Use missingSkills/gapType="missing" for new learning or adding missing repo evidence.
- Use weakSkills/gapType="weak" for improvement tasks such as docs, validation, tests, refactor, production config, or clearer implementation evidence.
- If REST API, Database, Authentication, or Docker Basics are detected but weak, write tasks as "cung co/lam ro/cai thien", not "hoc tu dau".
- If API Testing is missing, prioritize adding Jest/Supertest or integration tests as new learning/work.
- Every skill name must use the canonical name from Roadmap Skill Gap Context.
- mainPath phases and tasks must use only canonical skills from Roadmap Skill Gap Context skillGapSummary/skillGaps.
- Do not invent a new primary skillName or canonicalSkillName for mainPath tasks.
- canonicalSkillName must semantically match the task title and description.
- Treat each prioritySkills/missing skill as a required learning topic and cover every high-priority missing skill at least once.
- Keep title, description, canonicalSkillName, technology and difficulty on the same topic; never relabel an unrelated task to satisfy coverage.
- Ground framework-specific tasks in repository technologies. For Node.js/Express repositories, authentication examples must use Node.js/Express rather than Python, .NET, Django or ASP.NET.
- For Backend Developer mainPath tasks, do not use frontend-only skills such as React UI, Responsive Design, Component Design, State Management, or Frontend Testing.
- Within the same week, do not assign every task the same canonicalSkillName when task titles cover different sub-skills.
- For Frontend Developer tasks, prefer the most specific matching skill among React UI, Component Design, State Management, API Integration, Frontend Testing, Responsive Design, Accessibility, Performance Optimization, and Documentation.
- For Backend Developer tasks, prefer the most specific matching skill among REST API, Database, Authentication, Docker Basics, API Testing, Documentation, and Clean Code.
- For Mobile Developer tasks, prefer the most specific matching skill among Mobile UI, Navigation, Local Storage, API Integration, App State Management, Documentation, and Clean Code.
- For DevOps Engineer tasks, prefer the most specific matching skill among Docker, Kubernetes, CI/CD, Infrastructure as Code, Monitoring, and Documentation.
- If an alternative path uses skills outside the selected target role, clearly label it as a supporting/cross-functional path in title, pathType, and reason.
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
- mainPath must have exactly ${durationWeeks} phases, one phase per week.
- Phase 1 represents week 1, phase 2 represents week 2, and so on through week ${durationWeeks}.
- Each phase should have 2 to 4 tasks.
- supportingPaths must contain exactly 2 items.
- Resources can be empty array if no reliable resource URL is available.
- Do not generate resource URLs inside roadmap tasks.
- Keep the roadmap practical for a student MVP.
- beginner: focus on fundamentals, clear explanations, and small projects.
- intermediate: focus on deeper practice, testing, refactor, basic CI/CD, and clean code.
- advanced: focus on architecture, security, performance, production, and monitoring.
- Use clear Vietnamese.

AUTHORITATIVE_ROLE_AND_SKILL_GAP:
${safeJson(roadmapGapContext)}

USER_CONTRIBUTION_SUMMARY:
${safeJson({ analyses: githubContext?.latestAnalysisSnapshots || [], skillSignals: githubContext?.skillSignals || [] })}

GENERAL_PROJECT_CONTEXT:
${safeJson({ repositories: (githubContext?.repositories || []).slice(0, 3).map((repo) => ({ name: repo.name, fullName: repo.fullName, description: repo.description, language: repo.language, topics: repo.topics, packages: (repo.packages || []).slice(0, 12) })) })}

PRIOR_FEEDBACK_CONTEXT:
${safeJson(githubContext?.aiFeedbackSummary || null)}
`;
}

module.exports = {
  buildRoadmapPrompt,
};
