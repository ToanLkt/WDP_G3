export interface RoadmapStep {
  id: string;
  title: string;
  description: string;
  duration: string; // e.g. "Week 1-2"
  status: 'locked' | 'in_progress' | 'completed';
  resources: string[]; // List of helpful links or guide titles
  studentFocus: string; // Tailored tips for college students
}

export interface Roadmap {
  repoId: string;
  repoName: string;
  title: string;
  techStack: string[];
  steps: RoadmapStep[];
  progressPercent: number; // calculated dynamically
}

export const mockGenerateRoadmap = (repoId: string, repoName: string, language = 'TypeScript'): Promise<Roadmap> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      let title = `Student Learning Pathway: ${repoName}`;
      let techStack: string[] = [];
      let steps: RoadmapStep[] = [];

      // Determine tech stack and stages based on repoId or language
      if (repoId === 'repo_1' || language === 'TypeScript' || language === 'JavaScript') {
        techStack = ['React Native', 'Expo', 'TypeScript'];
        steps = [
          {
            id: 'step_rn_1',
            title: 'Master Mobile UI Flexbox & Theme Styling',
            description: 'Learn to build beautiful responsive phone layouts using StyleSheet API, safe area boundaries, and light/dark theme variables.',
            duration: 'Week 1-2',
            status: 'completed',
            resources: [
              'Expo Official Layout Guides (docs.expo.dev)',
              'React Native Styling Reference Cheat Sheet',
            ],
            studentFocus: 'Tip: Take screenshots of your mobile screens and compile them into a Google Drive folder. Recruiters love visual proofs!',
          },
          {
            id: 'step_rn_2',
            title: 'Enforce Strict TypeScript Configurations',
            description: 'Clean up all "any" variables. Enable strict null-checking inside tsconfig.json to prevent app crashes.',
            duration: 'Week 3',
            status: 'in_progress',
            resources: [
              'TypeScript handbook on strict compiler flags',
              'Declaring Props Interfaces in React Native',
            ],
            studentFocus: 'Tip: Eliminate compiler warnings before shipping. Write clean interfaces that stand out in code reviews.',
          },
          {
            id: 'step_rn_3',
            title: 'Deploy Automated Component Snapshots & Jest Tests',
            description: 'Write unit test suites using @testing-library/react-native to test forms validation logic and navigation transitions.',
            duration: 'Week 4-5',
            status: 'locked',
            resources: [
              'Jest framework configurations for React Native',
              'Testing user inputs and button clicks in Expo',
            ],
            studentFocus: 'Tip: Adding a Jest badge to your repo README is a major highlight that distinguishes student projects.',
          },
          {
            id: 'step_rn_4',
            title: 'Automate CI/CD Pipelines & Build Artifacts',
            description: 'Create a GitHub Actions script that compiles and verifies type safety on every push request to main.',
            duration: 'Week 6',
            status: 'locked',
            resources: [
              'Configuring GitHub Actions for React Native Expo builds',
              'Publishing development updates via EAS (Expo Application Services)',
            ],
            studentFocus: 'Tip: Link your EAS development build URL in your CV. Interviewers can test your actual app live on their phones!',
          }
        ];
      } else if (language === 'Java') {
        techStack = ['Java OOP', 'Spring Boot', 'SQL'];
        steps = [
          {
            id: 'step_java_1',
            title: 'SOLID Principles & Clean OOP Architecture',
            description: 'Refactor code to separate concerns. Utilize interface abstractions, encapsulation, and dependency injection patterns.',
            duration: 'Week 1-2',
            status: 'completed',
            resources: [
              'SOLID design principles in Java tutorials',
              'Separating Model-View-Controller (MVC) layers',
            ],
            studentFocus: 'Tip: Be ready to explain SOLID principles in developer interviews. Cite this project as your practical sandbox.',
          },
          {
            id: 'step_java_2',
            title: 'Algorithms Complexities & Big-O Optimization',
            description: 'Review collections data structures: replace slow linear searches with index maps. Optimize nested loops to O(N log N).',
            duration: 'Week 3',
            status: 'in_progress',
            resources: [
              'Java Collections Framework performance indices',
              'Big-O notation refresher for data structure audits',
            ],
            studentFocus: 'Tip: Preparing for coding rounds? Use your DSA practice repo to explain time-complexity optimization trade-offs.',
          },
          {
            id: 'step_java_3',
            title: 'Database Schema normalization & Spring Data JPA',
            description: 'Link relational databases (MySQL/PostgreSQL) and implement secure entity mappings to prevent SQL Injections.',
            duration: 'Week 4-5',
            status: 'locked',
            resources: [
              'Normalizing database tables (1NF, 2NF, 3NF)',
              'Writing custom repositories using Spring Boot JPA',
            ],
            studentFocus: 'Tip: Draw a clean Database Schema diagram and link it directly in your project README file.',
          },
          {
            id: 'step_java_4',
            title: 'Build Secure REST APIs & OpenAPI Specs',
            description: 'Deploy JWT token authentication. Auto-generate interactive Swagger docs using springdoc-openapi.',
            duration: 'Week 6-7',
            status: 'locked',
            resources: [
              'Spring Boot Security JWT configuration steps',
              'Swagger OpenAPI documentation integrations',
            ],
            studentFocus: 'Tip: Host your API on a free hosting tier (e.g. Render, Railway) and link the Swagger page as your live demo.',
          }
        ];
      } else {
        // Fallback or Web/HTML
        techStack = ['HTML5', 'CSS3', 'Modern Javascript'];
        steps = [
          {
            id: 'step_web_1',
            title: 'Semantic HTML5 & Responsive Mobile Grid Layouts',
            description: 'Refactor div blocks to semantic markup (header, section, main, article, footer). Apply Flexbox and CSS grids.',
            duration: 'Week 1',
            status: 'completed',
            resources: [
              'MDN Web Docs on Semantic HTML5 structures',
              'CSS Flexbox and CSS Grid responsive layouts',
            ],
            studentFocus: 'Tip: Test your layout on Chrome DevTools in Mobile view. Responsive UI is highly graded in junior roles.',
          },
          {
            id: 'step_web_2',
            title: 'Vanilla JavaScript DOM Event Loops',
            description: 'Refactor repetitive HTML inline attributes. Wire script listeners securely, preventing cross-site scripting (XSS).',
            duration: 'Week 2-3',
            status: 'in_progress',
            resources: [
              'JavaScript Event Listeners and Bubbling lifecycle',
              'Preventing XSS injections in client-side text renderings',
            ],
            studentFocus: 'Tip: Explain how Javascript handles events asynchronously in your project notes.',
          },
          {
            id: 'step_web_3',
            title: 'Vite Setup & CSS Framework Migration',
            description: 'Migrate script imports to module loaders (Vite). Integrate flexible CSS tokens to clean up custom style lists.',
            duration: 'Week 4',
            status: 'locked',
            resources: [
              'Creating zero-config web bundles using Vite',
              'Modern web typography & CSS variables theme setups',
            ],
            studentFocus: 'Tip: Group all raw styling variables into a single :root configuration file for easy maintenance.',
          },
          {
            id: 'step_web_4',
            title: 'Vercel/Netlify Deployment & Google SEO Auditing',
            description: 'Configure continuous deployments. Run Google Lighthouse audits to secure 95+ scores in performance and accessibility.',
            duration: 'Week 5',
            status: 'locked',
            resources: [
              'One-click website deployments via Vercel GitHub integration',
              'Google Lighthouse SEO audit optimizations guide',
            ],
            studentFocus: 'Tip: Share your live Vercel URL link in your LinkedIn summary to attract recruiters.',
          }
        ];
      }

      // Calculate progress initial percentages
      const completedCount = steps.filter(s => s.status === 'completed').length;
      const progressPercent = Math.round((completedCount / steps.length) * 100);

      resolve({
        repoId,
        repoName,
        title,
        techStack,
        steps,
        progressPercent,
      });
    }, 1000);
  });
};
