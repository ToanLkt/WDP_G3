import { Repository } from './repo';

export interface DashboardData {
  github_connected: boolean;
  total_repos: number;
  analyzed_repos: number;
  current_skill_direction: string;
}

export const mockFetchDashboardData = (
  githubConnected: boolean,
  repos: Repository[]
): Promise<DashboardData> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const totalRepos = githubConnected ? repos.length : 0;
      const analyzedRepos = githubConnected ? repos.filter((r) => r.is_analyzed).length : 0;

      // Determine the primary skill direction based on repositories languages
      let skillDirection = 'Full Stack Developer';
      if (githubConnected && repos.length > 0) {
        const langCounts: { [key: string]: number } = {};
        repos.forEach((repo) => {
          langCounts[repo.language] = (langCounts[repo.language] || 0) + 1;
        });

        const sortedLangs = Object.keys(langCounts).sort(
          (a, b) => langCounts[b] - langCounts[a]
        );

        const topLang = sortedLangs[0];
        if (topLang === 'TypeScript' || topLang === 'JavaScript') {
          skillDirection = 'React Native & Frontend Engineer';
        } else if (topLang === 'Python') {
          skillDirection = 'Artificial Intelligence & Python Engineer';
        } else if (topLang === 'Rust' || topLang === 'Go') {
          skillDirection = 'Backend & Systems Engineer';
        } else {
          skillDirection = `${topLang} Developer`;
        }
      }

      resolve({
        github_connected: githubConnected,
        total_repos: totalRepos,
        analyzed_repos: analyzedRepos,
        current_skill_direction: skillDirection,
      });
    }, 1000);
  });
};
