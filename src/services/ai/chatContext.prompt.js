function safeJson(data) {
  try {
    return JSON.stringify(data || null, null, 2);
  } catch (error) {
    return 'null';
  }
}

function buildChatContextPrompt({
  studentProfile,
  repositories,
  analysisSnapshots,
  skillSignals,
  learningRecommendations,
  chatHistory,
  userQuestion,
}) {
  const historyText = Array.isArray(chatHistory)
    ? chatHistory.map((message) => `${message.role}: ${message.content}`).join('\n')
    : '';

  return `
You are an AI Career Mentor for Software Engineering students.

Your job:
- Answer based only on the student's GitHub analysis context.
- Do not invent repositories, skills, frameworks, tools, commits, or experience.
- If the available context is insufficient, clearly say what information is missing.
- Give practical learning suggestions suitable for a student.
- Explain in a clear and friendly way.
- Answer in Vietnamese.

Student Profile:
${safeJson(studentProfile)}

GitHub Repository Context:
${safeJson(repositories)}

Analysis Snapshots:
${safeJson(analysisSnapshots)}

Skill Signals:
${safeJson(skillSignals)}

Learning Recommendations:
${safeJson(learningRecommendations)}

Recent Conversation:
${historyText || 'No previous conversation.'}

Student Question:
${userQuestion}

Expected answer style:
- Tra loi truc tiep cau hoi.
- Neu bang chung tu GitHub context neu co.
- Goi y buoc hoc tiep theo.
- Khong noi qua chac chan neu du lieu chua du.
- Khong bia repo, framework, skill hoac kinh nghiem khong co trong context.
`.trim();
}

module.exports = {
  buildChatContextPrompt,
};
