function safeJson(data) {
  try {
    return JSON.stringify(data || null, null, 2);
  } catch (error) {
    return 'null';
  }
}

function buildChatContextPrompt({
  intent,
  skillScoreContext,
  studentProfile,
  repositories,
  analysisSnapshots,
  skillSignals,
  learningRecommendations,
  chatHistory,
  userQuestion,
}) {
  const historyText = Array.isArray(chatHistory)
    ? chatHistory.slice(-4).map((message) => `${message.role}: ${message.content}`).join('\n')
    : '';
  const hasSkillScoreData = Boolean(skillScoreContext?.hasSkillScoreData);
  const compactGithubContext = {
    studentProfile: studentProfile || null,
    repositories: Array.isArray(repositories) ? repositories.slice(0, 2) : [],
    analysisSnapshots: Array.isArray(analysisSnapshots)
      ? analysisSnapshots.slice(0, 2).map((snapshot) => ({
          repoName: snapshot.repoName,
          projectType: snapshot.projectType,
          careerDirection: snapshot.careerDirection,
          missingSkills: snapshot.missingSkills || [],
          strengths: snapshot.strengths || [],
          weaknesses: snapshot.weaknesses || [],
          recommendations: snapshot.recommendations || [],
          scores: snapshot.scores || {},
          commitSummary: snapshot.commitSummary || {},
        }))
      : [],
    skillSignals: Array.isArray(skillSignals) ? skillSignals.slice(0, 8) : [],
    learningRecommendations: Array.isArray(learningRecommendations) ? learningRecommendations.slice(0, 5) : [],
  };

  return `
You are a concise technical AI mentor for software engineering students.

Core rules:
- Answer directly and briefly. Default length: 3-7 bullets, max 120-180 words.
- Primary source is Skill Score Context from skillVector, SkillSignal, and analysis after commit analysis.
- Do not repeat the whole context.
- Do not invent skills, scores, repositories, roles, frameworks, commits, or experience.
- If skill score data is missing, answer exactly: "Hien chua du du lieu phan tich tu repo de xac dinh."
- Use Vietnamese if the student asks in Vietnamese.
- Do not create a long roadmap unless the student explicitly asks for a detailed roadmap.
- If the student asks for details, you may answer longer but keep clear structure.

Intent:
${intent || 'GENERAL'}

Skill Score Context:
${safeJson(skillScoreContext)}

Has Skill Score Data:
${hasSkillScoreData ? 'true' : 'false'}

Compact Secondary GitHub Context:
${safeJson(compactGithubContext)}

Intent-specific format:
- WEAK_SKILLS: Start with "Ban dang yeu/thieu cac ky nang sau:" then list max 5-7 skills. Include score if available and one short reason. Do not add long advice.
- STRONG_SKILLS: Start with "Ban dang manh o:" then list max 5 skills with score if available.
- NEXT_SKILLS: Start with "Ban nen uu tien hoc:" then list max 3-5 skills with one short reason.
- ROLE_FIT: List max 3 matching roles from roleMatches. If no roleMatches or skill data is weak, say not enough data.
- REPO_REVIEW: Give only 3-5 main observations.
- GENERAL: Answer briefly and prefer Skill Score Context if relevant.
- DETAIL_REQUEST: More detail is allowed, but keep it structured and avoid filler.

Recent Conversation:
${historyText || 'No previous conversation.'}

Student Question:
${userQuestion}
`.trim();
}

module.exports = {
  buildChatContextPrompt,
};
