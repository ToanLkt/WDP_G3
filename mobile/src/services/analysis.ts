export interface PackageInfo {
  name: string;
  version: string;
  status: 'production' | 'development' | 'outdated';
}

export interface Recommendation {
  id: string;
  skill: string;
  reason: string;
  action: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

export interface AnalysisResult {
  repoId: string;
  project_type: string;
  tech_stack: string[];
  readme_summary: string;
  package_info: PackageInfo[];
  commit_summary: string;
  missing_items: string[];
  recommendations: Recommendation[];
}

export const mockFetchAnalysisResult = (repoId: string): Promise<AnalysisResult> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Determine response based on some basic repo matching
      let projectType = 'Modern Software Package';
      let techStack: string[] = [];
      let readmeSummary = '';
      let packages: PackageInfo[] = [];
      let commits = 'Consistent individual commits over the last 30 days. High test coverage patterns but lacks visual test setups.';
      let missingItems: string[] = [];
      let recommendations: Recommendation[] = [];

      if (repoId === 'repo_1') {
        projectType = 'Mobile Application (iOS/Android)';
        techStack = ['React Native', 'Expo', 'TypeScript', 'React Navigation', 'StyleSheet API'];
        readmeSummary = 'This repository contains a full-featured premium dark mode admin dashboard. The code highlights modular component structures, static state caching, and responsive grid layouts suited for tablets and phones.';
        packages = [
          { name: 'expo', version: '^56.0.0', status: 'production' },
          { name: 'react-native', version: '0.85.3', status: 'production' },
          { name: 'typescript', version: '^6.0.3', status: 'production' },
          { name: 'react-navigation', version: '^6.x', status: 'outdated' },
        ];
        commits = 'Excellent semantic commit history: feat(ui), fix(auth), chore(deps). Commits display clear descriptions and average 12 modifications per changeset.';
        missingItems = [
          'Missing Jest component snapshots.',
          'Missing ESLint rules for TypeScript strict null-checks.',
          'No visual preview images or GIFs in the README.md.',
        ];
        recommendations = [
          {
            id: 'rec_1',
            skill: 'Native Bridge Integrations',
            reason: 'You have mastered JS/TS React Native layout styling. Transitioning to custom swift/kotlin native modules will make you an elite mobile engineer.',
            action: 'Build a small native swift helper module that measures storage disk-space and exposes it through a NativeModule bridge to React Native.',
            difficulty: 'Advanced',
          },
          {
            id: 'rec_2',
            skill: 'State-Level Jest Snapshot Testing',
            reason: 'The app contains complex navigation and user input state hooks but lacks automated unit assertions.',
            action: 'Install @testing-library/react-native and write render assertions for LoginScreen text inputs.',
            difficulty: 'Intermediate',
          }
        ];
      } else if (repoId === 'repo_5') {
        projectType = 'Frontend Web Application';
        techStack = ['Vue 3', 'Pinia Store', 'Vite', 'Stripe checkout API', 'Vanilla CSS'];
        readmeSummary = 'E-commerce storefront featuring dynamic routing and cart management. Excellent design formatting, optimized image assets, and complete checkout system mocks.';
        packages = [
          { name: 'vue', version: '^3.3.0', status: 'production' },
          { name: 'pinia', version: '^2.1.0', status: 'production' },
          { name: 'vite', version: '^5.0.0', status: 'production' },
          { name: 'stripe-js', version: '^2.0.0', status: 'development' },
        ];
        commits = 'Regular daily activity. Commits focus heavily on layouts and UI adjustments. Lacks structured pre-commit hooks.';
        missingItems = [
          'Lacks continuous integration configs (GitHub Actions, CircleCI).',
          'Missing mock server endpoints for Stripe webhooks.',
          'No details about unit testing coverage levels.',
        ];
        recommendations = [
          {
            id: 'rec_3',
            skill: 'CI/CD Workflow Engineering',
            reason: 'Deployments are currently run manually. Automating check-ins will secure product shipments.',
            action: 'Set up a .github/workflows/deploy.yml pipeline that triggers typescript verification and npm run build on main branch commits.',
            difficulty: 'Intermediate',
          },
          {
            id: 'rec_4',
            skill: 'Stripe Webhooks & Node Backend integration',
            reason: 'The client completes checkout tokens but needs server-to-server transaction validation.',
            action: 'Implement a tiny Express.js backend containing stripe.webhooks.constructEvent validation middleware.',
            difficulty: 'Advanced',
          }
        ];
      } else if (repoId === 'repo_9') {
        projectType = 'DevOps & Tooling Boilerplate';
        techStack = ['Docker', 'Bash', 'GitHub Actions', 'Nginx', 'SSL Certbot'];
        readmeSummary = 'Infrastructure repo configuring highly secure container configurations for web servers, automated SSL generation, and CI linting pipelines.';
        packages = [
          { name: 'nginx-alpine', version: '1.25', status: 'production' },
          { name: 'certbot', version: '2.8', status: 'production' },
        ];
        commits = 'Occasional infrastructure updates. Commits are generic and lack detail (e.g. "update config", "fix script").';
        missingItems = [
          'No security scan integrations (e.g. Trivy container vulnerability scanner).',
          'Missing README guide on local docker-compose environments setup.',
        ];
        recommendations = [
          {
            id: 'rec_5',
            skill: 'Container Security Scanning',
            reason: 'You have structured powerful docker setups, but tracking container vulnerabilities is key for production-grade DevOps.',
            action: 'Integrate Aquasecurity Trivy action in the GitHub Workflow file to analyze vulnerabilities on push.',
            difficulty: 'Intermediate',
          }
        ];
      } else {
        // Dynamic fallback fallback report based on name
        projectType = 'Software Repository';
        techStack = ['Modern Stack', 'TypeScript', 'Node.js'];
        readmeSummary = `Analytical code audit of the ${repoId} package. The codebase reflects a clean modern outline, but shows several optimization options regarding structured setups and environment scripts.`;
        packages = [
          { name: 'core-dep', version: '1.0.0', status: 'production' },
          { name: 'dev-helper', version: '0.9.0', status: 'development' },
        ];
        commits = 'Standard developer commits. Active check-ins are logged but lack standard lint descriptions.';
        missingItems = [
          'Missing robust setup guide in the README.md.',
          'Missing unit tests.',
          'No clear instructions regarding environment variables.',
        ];
        recommendations = [
          {
            id: 'rec_generic_1',
            skill: 'Strict Unit Assertions',
            reason: 'Writing modular code is fine, but checking function invariants is crucial for long term project stability.',
            action: 'Install Jest, write at least 5 unit tests for core module utility functions.',
            difficulty: 'Beginner',
          },
          {
            id: 'rec_generic_2',
            skill: 'Environment Variables management',
            reason: 'Hardcoding API paths or secrets in code blocks presents leakage risks.',
            action: 'Establish dot-env setups and access all endpoints using process.env mappings.',
            difficulty: 'Beginner',
          }
        ];
      }

      resolve({
        repoId,
        project_type: projectType,
        tech_stack: techStack,
        readme_summary: readmeSummary,
        package_info: packages,
        commit_summary: commits,
        missing_items: missingItems,
        recommendations,
      });
    }, 1000);
  });
};
