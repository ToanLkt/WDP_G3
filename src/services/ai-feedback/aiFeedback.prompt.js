const buildAiFeedbackPrompt = (context) => {
  const payload = {
    repository: {
      repoName: context.repoName,
      fullName: context.fullName,
      projectType: context.projectType,
    },
    dev2vec: {
      modelVersion: context.modelVersion,
      scoringMethod: context.scoringMethod,
      topRole: context.topRole,
      rolePrediction: context.rolePrediction,
      matchedSkillNames: context.matchedSkillNames,
      weakSkillNames: context.weakSkillNames,
      missingSkillNames: context.missingSkillNames,
      recommendedNextSkills: context.recommendedNextSkills,
      sourceStats: {
        commitCount: context.sourceStats?.commitCount || 0,
        apiTokenCount: context.sourceStats?.apiTokenCount || 0,
        issueCount: context.sourceStats?.issueCount || 0,
        changedFileCount: context.sourceStats?.changedFileCount || 0,
      },
      vectorSources: context.vectorSources,
      evidencePreview: {
        recentCommitMessages: context.evidencePreview?.recentCommitMessages || context.evidencePreview?.commitMessages || [],
        apiTokens: context.evidencePreview?.apiTokens || [],
        issues: context.evidencePreview?.issues || [],
        docs: context.docsEvidence || context.evidencePreview?.docs || {},
      },
    },
  };

  return `
Ban la AI mentor dinh huong nghe nghiep cho sinh vien nganh ky thuat phan mem.
Hay tao feedback ca nhan hoa, de hieu, thuc te va dua tren Dev2Vec analysis context ben duoi.

Yeu cau:
- Tra loi bang tieng Viet co dau.
- Chi su dung du lieu co trong Dev2Vec context.
- Khong bia skill, role, repo, issue, commit, file, framework hoac kinh nghiem.
- Khong noi chac chan "ban la Backend Developer". Hay noi "Dua tren Dev2Vec analysis tu repository evidence, ban dang co xu huong phu hop voi ...".
- Role prediction la classifier probability, khong phai ket luan tuyet doi.
- Skill gaps den tu skill prototype similarity.
- Neu vectorSources.issues=false hoac issueCount=0, them risk note ngan: "Phan tich hien chua co du lieu issue."
- Neu changedFileCount=0, khong noi da phan tich changed files chi tiet.
- Documentation rules:
  - Do not say "missing README" if docs.readmeRootExists=true.
  - Do not say "no documentation" if docs.markdownFileCount>0 or docs.hasDocsDirectory=true.
  - If docs.readmeRootExists=true and docs.markdownFileCount>1, say repo already has README/Markdown docs; recommend improving organization/navigation only if needed.
  - If docs.readmeRootExists=false but docs.markdownFileCount>0, say Markdown docs exist but root README.md should be added as an entry point.
  - If docs.documentationStatus="unknown", say documentation evidence is not available; do not claim missing documentation.
- Strengths nen dua tren top role, matched skills, API tokens/commit evidence neu co.
- Weaknesses nen dua tren weakSkillNames va missingSkillNames.
- Recommendations/nextSteps nen dua tren recommendedNextSkills.
- Feedback tap trung vao hoc tap, cai thien repo va dinh huong nghe nghiep.
- Chi tra ve JSON object hop le, khong markdown, khong code block, khong giai thich ngoai JSON.

JSON format bat buoc:
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

Dev2Vec context:
${JSON.stringify(payload, null, 2)}
`.trim();
};

module.exports = {
  buildAiFeedbackPrompt,
};
