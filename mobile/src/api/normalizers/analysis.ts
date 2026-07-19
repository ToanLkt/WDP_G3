import type { AnalysisResult } from '../../types';
import { cleanAnalysisText } from './analysisText';
import { asArray, asNumber, asRecord, extractObject, firstString } from './helpers';

export const normalizeAnalysis = (payload: unknown): AnalysisResult => {
  const source = asRecord(extractObject(payload, ['analysis', 'result', 'snapshot']));
  const summary = asRecord(source.summary);
  const scoreBreakdown = asRecord(source.scoreBreakdown);
  const scores = asRecord(source.scores ?? source.scoreBreakdown ?? summary.scoreBreakdown);
  const careerDirectionValue = source.careerDirection ?? summary.careerDirection;
  const careerDirection = asRecord(careerDirectionValue);
  const commitSummary = asRecord(source.commitSummary);
  const checklist = asRecord(source.checklist);
  const portfolioReadiness = asRecord(source.portfolioReadiness);
  const analysisScope = asRecord(source.analysisScope ?? source.scope);
  const repository = asRecord(source.repository);
  const repositoryId = firstString(source.repositoryId, repository.repositoryId, repository._id, repository.id);
  const repoName = firstString(source.repoName, source.repositoryName, repository.repoName, repository.name, 'Repository');

  return {
    id: firstString(source.id, source._id, source.analysisId),
    snapshotId: firstString(source.snapshotId) || undefined,
    repositoryId,
    repositoryName: repoName,
    repoName,
    fullName: firstString(source.fullName, repository.fullName, repository.full_name),
    createdAt: firstString(source.createdAt, source.analyzedAt, new Date().toISOString()),
    projectType: firstString(summary.projectType, source.projectType, source.type, 'Unknown'),
    techStack: asArray(source.techStack ?? source.technologies).map(cleanAnalysisText),
    languages: asArray(source.languages).map(cleanAnalysisText),
    frameworks: asArray(source.frameworks).map(cleanAnalysisText),
    packages: asArray(source.packages).map((item) => {
      const record = asRecord(item);
      return cleanAnalysisText(firstString(record.name, record.path, String(item)));
    }).filter(Boolean),
    skillSignals: asArray(source.skillSignals).map(cleanAnalysisText),
    careerSignals: asArray(source.careerSignals).map(cleanAnalysisText),
    scores: {
      architecture: asNumber(scores.architecture),
      completeness: asNumber(scores.completeness),
      commitQuality: asNumber(scores.commitQuality ?? scores.commitQualityScore),
      documentation: asNumber(scores.documentation ?? scores.documentationScore),
      codeConvention: asNumber(scores.codeConvention ?? scores.codeQuality),
      overall: asNumber(scores.overall ?? scores.overallScore ?? summary.overallScore ?? source.overallScore),
      techStackScore: asNumber(scores.techStackScore ?? scores.techStack),
      documentationScore: asNumber(scores.documentationScore ?? scores.documentation),
      commitQualityScore: asNumber(scores.commitQualityScore ?? scores.commitQuality),
      deploymentScore: asNumber(scores.deploymentScore ?? scores.deployment),
      testingScore: asNumber(scores.testingScore ?? scores.testing),
      portfolioReadinessScore: asNumber(scores.portfolioReadinessScore ?? scores.portfolioReadiness),
      overallScore: asNumber(scores.overallScore ?? scores.overall ?? summary.overallScore ?? source.overallScore),
    },
    skillVector: asArray(source.skillVector).map((item) => {
      const record = asRecord(item);
      return {
        canonicalSkillName: firstString(record.canonicalSkillName, record.name),
        normalizedSkillName: firstString(record.normalizedSkillName),
        category: firstString(record.category, 'Tổng quát'),
        score: asNumber(record.score),
        level: firstString(record.level, 'missing') as 'missing' | 'weak' | 'developing' | 'strong',
        evidence: asArray(record.evidence).map(String),
        sources: asArray(record.sources).map(String),
      };
    }),
    strengths: asArray(source.strengths).map(cleanAnalysisText),
    weaknesses: asArray(source.weaknesses).map(cleanAnalysisText),
    recommendations: asArray(source.recommendations).map((item, index) => {
      const record = asRecord(item);
      const text = typeof item === 'string' ? item : '';
      const title = cleanAnalysisText(firstString(record.title, text || 'Khuyến nghị'));
      return {
        id: firstString(record.id, record._id, `recommendation-${index}`),
        title,
        description: cleanAnalysisText(firstString(record.description, record.content, title)),
        priority: firstString(record.priority, 'medium') as 'high' | 'medium' | 'low',
        category: firstString(record.category, 'other') as 'architecture' | 'documentation' | 'testing' | 'security' | 'performance' | 'other',
      };
    }),
    missingSkills: asArray(source.missingSkills).map((item, index) => {
      const record = asRecord(item);
      return {
        id: firstString(record.id, record._id, `skill-${index}`),
        name: cleanAnalysisText(firstString(record.skill, record.name, record.skillName, record.canonicalSkillName, String(item))),
        category: cleanAnalysisText(firstString(record.category, 'Tổng quát')),
        level: firstString(record.level, 'beginner') as 'beginner' | 'intermediate' | 'advanced',
        importance: firstString(record.importance, 'medium') as 'high' | 'medium' | 'low',
      };
    }),
    topSkills: asArray(source.topSkills ?? source.top_skills).map((item) => {
      const record = asRecord(item);
      return {
        canonicalSkillName: firstString(record.canonicalSkillName, record.name, record.skill),
        normalizedSkillName: firstString(record.normalizedSkillName),
        category: firstString(record.category, 'Tổng quát'),
        score: asNumber(record.score),
        level: firstString(record.level, 'missing') as 'missing' | 'weak' | 'developing' | 'strong',
        evidence: asArray(record.evidence).map(String),
        sources: asArray(record.sources).map(String),
      };
    }),
    careerDirection: {
      primary: cleanAnalysisText(firstString(
        careerDirection.primary,
        typeof careerDirectionValue === 'string' ? careerDirectionValue : undefined,
        summary.careerDirection,
        source.targetCareer,
        'Software Engineer'
      )),
      secondary: asArray(careerDirection.secondary).map(cleanAnalysisText),
      confidence: asNumber(careerDirection.confidence ?? summary.confidence),
      reasoning: cleanAnalysisText(firstString(careerDirection.reasoning)),
    },
    userLevel: firstString(summary.userLevel),
    summary: {
      userLevel: firstString(summary.userLevel) || undefined,
      userReadinessScore: typeof summary.userReadinessScore === 'number' ? summary.userReadinessScore : undefined,
      careerDirection: firstString(summary.careerDirection) || undefined,
      projectType: firstString(summary.projectType) || undefined,
    },
    analysisScope: {
      type: firstString(analysisScope.type),
      githubUsername: firstString(analysisScope.githubUsername),
      totalRepoCommits: asNumber(analysisScope.totalRepoCommits),
      userCommits: asNumber(analysisScope.userCommits),
      activeDays: asNumber(analysisScope.activeDays),
      firstCommitDate: firstString(analysisScope.firstCommitDate) || undefined,
      lastCommitDate: firstString(analysisScope.lastCommitDate) || undefined,
    },
    commitSummary: {
      totalCommits: asNumber(commitSummary.totalCommits),
      activeDays: asNumber(commitSummary.activeDays),
      vagueCommitRatio: asNumber(commitSummary.vagueCommitRatio),
      conventionalCommitRatio: asNumber(commitSummary.conventionalCommitRatio),
      firstCommitDate: firstString(commitSummary.firstCommitDate) || undefined,
      lastCommitDate: firstString(commitSummary.lastCommitDate) || undefined,
    },
    checklist: {
      hasReadme: Boolean(checklist.hasReadme),
      hasEnvExample: Boolean(checklist.hasEnvExample),
      hasDocker: Boolean(checklist.hasDocker),
      hasDockerCompose: Boolean(checklist.hasDockerCompose),
      hasCICD: Boolean(checklist.hasCICD),
      hasTesting: Boolean(checklist.hasTesting),
      hasLinting: Boolean(checklist.hasLinting),
      hasFormatter: Boolean(checklist.hasFormatter),
      hasPackageFile: Boolean(checklist.hasPackageFile),
    },
    portfolioReadiness: {
      overallReadiness: asNumber(portfolioReadiness.overallReadiness),
      items: asArray(portfolioReadiness.items).map((item) => {
        const record = asRecord(item);
        return {
          label: firstString(record.label, record.title),
          completed: Boolean(record.completed),
          importance: firstString(record.importance, 'important') as 'critical' | 'important' | 'nice-to-have',
        };
      }),
    },
  };
};

export const normalizeAnalyses = (payload: unknown) => {
  return asArray(payload).map(normalizeAnalysis);
};
