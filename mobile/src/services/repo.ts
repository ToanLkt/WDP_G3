export interface Repository {
  id: string;
  name: string;
  description: string;
  language: string;
  updated_at: string;
  has_readme: boolean;
  is_analyzed: boolean;
}

export const INITIAL_REPOSITORIES: Repository[] = [
  {
    id: 'repo_1',
    name: 'react-native-dashboard',
    description: 'A premium, dark-mode dashboard template for developers built with React Native, Expo, and TypeScript.',
    language: 'TypeScript',
    updated_at: '2026-05-30T10:30:00Z',
    has_readme: true,
    is_analyzed: true,
  },
  {
    id: 'repo_2',
    name: 'nextjs-portfolio-template',
    description: 'Minimalistic and highly customizable portfolio template built with Next.js, Tailwind CSS, and Framer Motion.',
    language: 'TypeScript',
    updated_at: '2026-05-28T14:45:00Z',
    has_readme: true,
    is_analyzed: false,
  },
  {
    id: 'repo_3',
    name: 'rust-wasm-game-engine',
    description: 'A 2D lightweight web game engine written in Rust compiling directly to WebAssembly for super fast render loops.',
    language: 'Rust',
    updated_at: '2026-05-25T08:15:00Z',
    has_readme: false,
    is_analyzed: false,
  },
  {
    id: 'repo_4',
    name: 'python-ai-chatbot',
    description: 'Context-aware neural network chatbot utilizing LangChain, HuggingFace transformers, and FastAPI.',
    language: 'Python',
    updated_at: '2026-05-22T16:20:00Z',
    has_readme: true,
    is_analyzed: false,
  },
  {
    id: 'repo_5',
    name: 'vue-ecommerce-app',
    description: 'Full-featured online store interface with Vue 3, Pinia state manager, and dynamic stripe checkout routing.',
    language: 'JavaScript',
    updated_at: '2026-05-18T11:05:00Z',
    has_readme: true,
    is_analyzed: true,
  },
  {
    id: 'repo_6',
    name: 'go-microservices-grpc',
    description: 'High performance backend microservices cluster using Go, gRPC protocols, and RabbitMQ message brokering.',
    language: 'Go',
    updated_at: '2026-05-12T09:40:00Z',
    has_readme: true,
    is_analyzed: false,
  },
  {
    id: 'repo_7',
    name: 'swiftui-weather-app',
    description: 'Beautiful iOS weather prediction app using clean architecture and modern Apple SwiftUI charts.',
    language: 'Swift',
    updated_at: '2026-05-05T13:55:00Z',
    has_readme: false,
    is_analyzed: false,
  },
  {
    id: 'repo_8',
    name: 'kotlin-android-notes',
    description: 'Offline-first secure notes application utilizing SQLite Room database, biometric lock, and jetpack compose.',
    language: 'Kotlin',
    updated_at: '2026-04-28T07:10:00Z',
    has_readme: true,
    is_analyzed: false,
  },
  {
    id: 'repo_9',
    name: 'docker-boilerplate-ci',
    description: 'Ready-to-use Docker environment configs containing full automated GitHub Actions CI/CD pipelines.',
    language: 'Shell',
    updated_at: '2026-04-20T17:30:00Z',
    has_readme: true,
    is_analyzed: true,
  },
  {
    id: 'repo_10',
    name: 'laravel-rest-api',
    description: 'Boilerplate restful API using PHP Laravel, Sanctum tokens auth, and integrated Swagger API documentation.',
    language: 'PHP',
    updated_at: '2026-04-10T12:00:00Z',
    has_readme: true,
    is_analyzed: false,
  },
  {
    id: 'repo_11',
    name: 'flutter-crypto-tracker',
    description: 'Dynamic cryptocurrency tracking widget written in Dart supporting dark theme and WebSocket streams.',
    language: 'Dart',
    updated_at: '2026-03-28T10:15:00Z',
    has_readme: false,
    is_analyzed: false,
  },
  {
    id: 'repo_12',
    name: 'spring-boot-auth',
    description: 'Corporate enterprise server stack highlighting Spring Security OAuth2 integration and LDAP support.',
    language: 'Java',
    updated_at: '2026-03-15T08:30:00Z',
    has_readme: true,
    is_analyzed: false,
  },
  {
    id: 'repo_13',
    name: 'student-grade-manager',
    description: 'A university school project managing courses, student rolls, grades database records, and GPA reports.',
    language: 'Java',
    updated_at: '2026-05-10T11:20:00Z',
    has_readme: true,
    is_analyzed: false,
  },
  {
    id: 'repo_14',
    name: 'java-dsa-practice',
    description: 'Complete structures of standard algorithms: Binary Search trees, Sorting algorithms, Graphs, and Hashmaps.',
    language: 'Java',
    updated_at: '2026-05-02T15:40:00Z',
    has_readme: false,
    is_analyzed: false,
  },
  {
    id: 'repo_15',
    name: 'html-portfolio-website',
    description: 'A static developer portfolio landing page outlining university homework projects, assignments, and contact forms.',
    language: 'HTML',
    updated_at: '2026-04-18T09:10:00Z',
    has_readme: true,
    is_analyzed: true,
  },
];

export interface RepoFilters {
  search?: string;
  language?: string;
  status?: 'analyzed' | 'not_analyzed' | 'all';
  sortBy?: 'name' | 'updated';
}

export const mockFetchRepositories = (
  repos: Repository[],
  filters: RepoFilters
): Promise<Repository[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      let result = [...repos];

      // 1. Search Filter
      if (filters.search && filters.search.trim().length > 0) {
        const query = filters.search.toLowerCase().trim();
        result = result.filter(
          (repo) =>
            repo.name.toLowerCase().includes(query) ||
            repo.description.toLowerCase().includes(query)
        );
      }

      // 2. Language Filter
      if (filters.language && filters.language !== 'All') {
        result = result.filter(
          (repo) => repo.language.toLowerCase() === filters.language?.toLowerCase()
        );
      }

      // 3. Status Filter
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'analyzed') {
          result = result.filter((repo) => repo.is_analyzed);
        } else if (filters.status === 'not_analyzed') {
          result = result.filter((repo) => !repo.is_analyzed);
        }
      }

      // 4. Sorting
      if (filters.sortBy) {
        if (filters.sortBy === 'name') {
          result.sort((a, b) => a.name.localeCompare(b.name));
        } else if (filters.sortBy === 'updated') {
          result.sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
        }
      }

      resolve(result);
    }, 800);
  });
};

export const mockAnalyzeRepo = (repoId: string): Promise<string> => {
  return new Promise((resolve) => {
    // 3 seconds delay to simulate real codebase analysis
    setTimeout(() => {
      resolve(repoId);
    }, 3000);
  });
};
