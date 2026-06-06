const buildAiFeedbackPrompt = (snapshot) => {
  const snapshotPayload = {
    repoName: snapshot.repoName,
    fullName: snapshot.fullName,
    projectType: snapshot.projectType,
    languages: snapshot.languages,
    frameworks: snapshot.frameworks,
    packages: snapshot.packages,
    configs: snapshot.configs,
    skillSignals: snapshot.skillSignals,
    careerSignals: snapshot.careerSignals,
    careerDirection: snapshot.careerDirection,
    strengths: snapshot.strengths,
    weaknesses: snapshot.weaknesses,
    missingSkills: snapshot.missingSkills,
    recommendations: snapshot.recommendations,
    scores: snapshot.scores,
    commitSummary: snapshot.commitSummary,
    checklist: snapshot.checklist,
  };

  return `Bạn là AI mentor định hướng nghề nghiệp cho sinh viên ngành Kỹ thuật phần mềm.
Hãy tạo feedback cá nhân hóa, dễ hiểu, thực tế và phù hợp với sinh viên dựa trên kết quả phân tích GitHub repository bên dưới.

Yêu cầu:
- Trả lời bằng tiếng Việt có dấu.
- Chỉ sử dụng dữ liệu có trong AnalysisSnapshot.
- Không bịa thông tin ngoài snapshot.
- Nếu dữ liệu thiếu, nói rõ dữ liệu chưa đủ.
- Không đánh giá con người, chỉ đánh giá repository và tín hiệu kỹ năng.
- Feedback tập trung vào học tập, cải thiện repo và định hướng nghề nghiệp.
- Gợi ý phải thực tế, phù hợp sinh viên.
- Chỉ trả về JSON hợp lệ.
- Không dùng markdown.
- Không bọc trong \`\`\`json hoặc \`\`\`.
- Không viết giải thích ngoài JSON.
- Quan trọng: Output phải là JSON object thuần, bắt đầu bằng { và kết thúc bằng }. Không dùng markdown code block.

JSON format bắt buộc:
{
  "summary": "string",
  "strengthFeedback": ["string"],
  "weaknessFeedback": ["string"],
  "learningAdvice": "string",
  "nextSteps": ["string"],
  "recommendedTopics": ["string"],
  "careerSuggestion": "string",
  "portfolioAdvice": "string",
  "riskNotes": ["string"]
}

AnalysisSnapshot:
${JSON.stringify(snapshotPayload, null, 2)}`;
};

module.exports = {
  buildAiFeedbackPrompt,
};
