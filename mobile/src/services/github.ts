export interface GitHubUser {
  username: string;
  avatarUrl: string;
  publicRepos: number;
  bio: string;
}

export const mockConnectGitHub = (pat: string): Promise<GitHubUser> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!pat || pat.trim().length === 0) {
        reject(new Error('GitHub Personal Access Token is required.'));
        return;
      }
      
      if (pat.startsWith('ghp_') && pat.length > 10) {
        resolve({
          username: 'octocat-dev',
          avatarUrl: 'https://avatars.githubusercontent.com/u/5832347?v=4',
          publicRepos: 18,
          bio: 'Frontend enthusiast & open source contributor. Coding in React Native & TypeScript.',
        });
      } else if (pat === 'valid_token') {
        resolve({
          username: 'master-coder',
          avatarUrl: 'https://avatars.githubusercontent.com/u/9919?v=4',
          publicRepos: 42,
          bio: 'Fullstack Software Engineer. Specializing in AI agents and mobile architectures.',
        });
      } else {
        reject(new Error('Invalid GitHub Personal Access Token. Please verify and try again.'));
      }
    }, 1500);
  });
};
