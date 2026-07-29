const getLanguageInstruction = (language) => {
  if (language === 'en') {
    return {
      label: 'English',
      rules: [
        'All natural language content must be written in English.',
        'Content must be practical, clear, and suitable for Software Engineering students.',
      ],
    };
  }

  return {
    label: 'Vietnamese',
    rules: [
      'All natural language content must be written in Vietnamese.',
      'Keep technical terms in English when common in software engineering, but explain them in Vietnamese when needed.',
      'Example: "Semantic HTML", "REST API", "component", "middleware", "authentication" can be kept in English.',
      'Content must be practical, clear, and suitable for Vietnamese Software Engineering students.',
      'Avoid overly academic writing. Use clear learning-oriented language.',
    ],
  };
};

const safeJson = (value) => JSON.stringify(value || {}, null, 2);

const buildLearningPrompt = ({ skillName, targetRole, level, language = 'vi', context, topicProfile }) => {
  const languageInstruction = getLanguageInstruction(language);
  const contextBlock = context
    ? `
Roadmap/task context for better examples:
${safeJson(context)}

Use this context to make the content practical for the specific roadmap task. The task topic is more specific than the canonical skill.
If context.learningMode="reinforcement", write the content as improvement/practice/checklist material for a skill already detected in the repo, not as a beginner introduction from zero.
If context.learningMode="new_learning", foundation content is acceptable because the skill is truly missing from repo evidence.
`
    : '';

  return `Generate learning content for Software Engineering students.

Skill: ${skillName}
Target role: ${targetRole}
Level: ${level}
Language: ${languageInstruction.label}
Specific task topic profile:
${safeJson(topicProfile)}
${contextBlock}

Return only valid JSON with this exact structure:
{
  "title": "",
  "overview": "",
  "whyLearn": "",
  "useCases": [],
  "howToApply": "",
  "examples": [
    {
      "title": "",
      "code": "",
      "explanation": ""
    }
  ],
  "checklist": [],
  "exercises": [
    {
      "title": "",
      "description": ""
    }
  ],
  "commonMistakes": [],
  "nextSkills": []
}

Rules:
- Return only valid JSON.
- Do not wrap JSON in markdown.
- Do not include explanations outside JSON.
${languageInstruction.rules.map((rule) => `- ${rule}`).join('\n')}
- Include at least 3 checklist items.
- Include at least 2 exercises.
- Include at least 1 practical example.
- If the skill is technical, include code in examples.
- The title, overview, examples, checklist, and exercises MUST directly address the specific task title/description and topic profile.
- Do not replace a specific task with a broad canonical skill topic.
- Include the strongest specific topic keywords in the title and overview when present.
- Code should remain valid and should not be translated.
- Explanation around code must follow the requested language.`;
};

module.exports = {
  buildLearningPrompt,
  getLanguageInstruction,
};
