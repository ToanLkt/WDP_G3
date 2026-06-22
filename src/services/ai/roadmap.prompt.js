function safeJson(data) {
  try {
    return JSON.stringify(data || null, null, 2);
  } catch (error) {
    return 'null';
  }
}

function buildRoadmapPrompt({ targetRole, githubContext }) {
  return `
You are an AI Career Mentor and Software Engineering curriculum designer.

Your task:
Generate a personalized learning roadmap for a Software Engineering student.

Important rules:
- The student selected this target role: ${targetRole}.
- The roadmap must prioritize the selected target role.
- Do not force the student to learn every missing skill.
- Build a main path that helps the student reach MVP competency for the selected target role.
- Use the student's GitHub analysis context as evidence.
- If the student's GitHub currently shows a different direction, mention it in currentGithubDirection and summary.
- Add 2 supporting paths:
  1. One path that reuses or extends the student's existing GitHub strengths.
  2. One path that improves job-readiness and employability.
- Do not invent repositories, technologies, or skills not present in the context.
- You may suggest missing skills only if they are relevant to the selected target role.
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
            "skillTags": [],
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
- Keep the roadmap practical for a student MVP.
- Use clear Vietnamese.

Student GitHub Context:
${safeJson(githubContext)}
`;
}

module.exports = {
  buildRoadmapPrompt,
};
