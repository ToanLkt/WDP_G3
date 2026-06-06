const roundRatio = (value) => Number(value.toFixed(2));

const analyzeCommits = (commits, rules) => {
  const commitList = Array.isArray(commits) ? commits.filter(Boolean) : [];
  const totalCommits = commitList.length;
  const vagueWords = (rules.commitRules && rules.commitRules.vagueMessages) || [];
  const conventionalPrefixes = (rules.commitRules && rules.commitRules.conventionalPrefixes) || [];
  const thresholds = (rules.commitRules && rules.commitRules.thresholds) || rules.commitRules || {};
  const strengths = [];
  const weaknesses = [];

  if (totalCommits === 0) {
    weaknesses.push(rules.commitRules.weaknesses.noCommitData);

    return {
      commitSummary: {
        totalCommits: 0,
        activeDays: 0,
        vagueCommitRatio: 0,
        conventionalCommitRatio: 0,
        firstCommitDate: null,
        lastCommitDate: null,
      },
      strengths,
      weaknesses,
    };
  }

  let vagueCommits = 0;
  let conventionalCommits = 0;
  const activeDaySet = new Set();
  const dates = [];

  for (const commit of commitList) {
    const message = String(commit.message || '').trim().toLowerCase();
    const authorDate = commit.authorDate ? new Date(commit.authorDate) : null;

    if (authorDate && !Number.isNaN(authorDate.getTime())) {
      activeDaySet.add(authorDate.toISOString().slice(0, 10));
      dates.push(authorDate);
    }

    const isVague = vagueWords.some((word) => message === word || message.startsWith(`${word} `) || message.startsWith(`${word}:`));
    if (isVague) {
      vagueCommits += 1;
    }

    const isConventional = conventionalPrefixes.some((prefix) => message.startsWith(prefix));
    if (isConventional) {
      conventionalCommits += 1;
    }
  }

  const activeDays = activeDaySet.size;
  const vagueCommitRatio = roundRatio(vagueCommits / totalCommits);
  const conventionalCommitRatio = roundRatio(conventionalCommits / totalCommits);
  const sortedDates = dates.sort((left, right) => left.getTime() - right.getTime());
  const firstCommitDate = sortedDates.length > 0 ? sortedDates[0] : null;
  const lastCommitDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

  if (totalCommits >= thresholds.goodCommitCount) {
    strengths.push(rules.commitRules.strengths.goodCommitCount);
  }

  if (conventionalCommitRatio >= thresholds.goodConventionalRatio) {
    strengths.push(rules.commitRules.strengths.goodCommitConvention);
  }

  if (activeDays >= thresholds.goodActiveDays) {
    strengths.push(rules.commitRules.strengths.activeDevelopment);
  }

  if (totalCommits > 0 && totalCommits < thresholds.lowCommitCount) {
    weaknesses.push(rules.commitRules.weaknesses.lowCommitCount);
  }

  if (vagueCommitRatio >= thresholds.highVagueRatio) {
    weaknesses.push(rules.commitRules.weaknesses.vagueMessages);
  }

  if (totalCommits > 0 && totalCommits <= thresholds.oneShotCommitThreshold) {
    weaknesses.push(rules.commitRules.weaknesses.oneShotUpload);
  }

  return {
    commitSummary: {
      totalCommits,
      activeDays,
      vagueCommitRatio,
      conventionalCommitRatio,
      firstCommitDate,
      lastCommitDate,
    },
    strengths,
    weaknesses,
  };
};

module.exports = {
  analyzeCommits,
};
