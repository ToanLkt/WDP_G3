import { apiClient, extractApiResource } from '../../api/client';
import { roadmapTargetRoles } from './constants';
import type {
  AIRecommendation,
  LearningNodeStatus,
  ResourceType,
  Roadmap,
  RoadmapCategory,
  RoadmapDifficulty,
  SkillGapAnalysis,
  RoadmapListParams,
} from './types';

export { roadmapTargetRoles }

type RoadmapTask = {
  _id?: string
  title?: string
  description?: string
  skillTags?: string[]
  status?: string
  estimatedHours?: number
  resources?: Array<{
    _id?: string
    title?: string
    type?: string
    url?: string
    provider?: string
    estimatedMinutes?: number
  }>
}

type RoadmapPhase = {
  _id?: string
  title?: string
  goal?: string
  skills?: string[]
  tasks?: RoadmapTask[]
  status?: string
}

export type BackendRoadmap = {
  _id?: string
  id?: string
  targetRole?: string
  currentGithubDirection?: string
  summary?: string
  mainPath?: {
    title?: string
    reason?: string
    phases?: RoadmapPhase[]
  }
  tasks?: RoadmapTask[]
  supportingPaths?: Array<{
    _id?: string
    title?: string
    reason?: string
    skills?: string[]
    suggestedTasks?: string[]
  }>
  sourceContextSummary?: {
    repositoriesCount?: number
    detectedSkills?: string[]
    missingSkills?: string[]
    latestAnalysisSnapshotId?: string
  }
  status?: 'active' | 'archived'
  createdAt?: string
  updatedAt?: string
}

const roleLabels: Record<string, string> = {
  'Frontend Developer': 'Frontend Developer',
  'Backend Developer': 'Backend Developer',
  'Fullstack Developer': 'Fullstack Developer',
  'Mobile Developer': 'Mobile Developer',
  'Tester / QA Engineer': 'Tester / QA Engineer',
  'DevOps Beginner': 'DevOps Beginner',
  'Data Analyst': 'Data Analyst',
  'AI / Machine Learning Beginner': 'AI / Machine Learning Beginner',
  'Generalist Software Engineer': 'Kỹ sư phần mềm đa hướng'
}

const textMap: Record<string, string> = {
  'Backend Developer MVP Path': 'Lộ trình Backend Developer cơ bản',
  'Fullstack Developer MVP Path': 'Lộ trình Fullstack Developer cơ bản',
  'Frontend Developer MVP Path': 'Lộ trình Frontend Developer cơ bản',
  'Mobile Developer MVP Path': 'Lộ trình Mobile Developer cơ bản',
  'Tester / QA Engineer MVP Path': 'Lộ trình Tester / QA Engineer cơ bản',
  'DevOps Beginner MVP Path': 'Lộ trình DevOps cơ bản',
  'Data Analyst MVP Path': 'Lộ trình Data Analyst cơ bản',
  'AI / Machine Learning Beginner MVP Path': 'Lộ trình AI / Machine Learning cơ bản',
  'Backend Foundation': 'Nền tảng Backend',
  'Database and API': 'Cơ sở dữ liệu và API',
  'Authentication and Security': 'Xác thực và bảo mật',
  'Testing and Deployment': 'Kiểm thử và triển khai',
  'Fullstack Extension': 'Mở rộng sang Fullstack',
  'Job-readiness Path': 'Chuẩn bị ứng tuyển',
  'Hoc va thuc hanh Node.js, Express.js': 'Học và thực hành Node.js, Express.js',
  'Hoc va thuc hanh MongoDB, Mongoose': 'Học và thực hành MongoDB, Mongoose',
  'Hoc va thuc hanh JWT, Validation': 'Học và thực hành JWT, Validation',
  'Hoc va thuc hanh Testing, Docker': 'Học và thực hành Testing, Docker',
  'Ap dung vao project GitHub hien co': 'Áp dụng vào project GitHub hiện có',
  'Tap trung vao nhung phan can thiet de dat MVP cho vai tro Backend Developer.': 'Tập trung vào phần cần thiết để đạt mức sẵn sàng cho vai trò Backend Developer.',
  'Cap nhat mot repository hien co hoac tao mini project de co bang chung thuc hanh.': 'Cập nhật một repository hiện có hoặc tạo mini project để có bằng chứng thực hành.',
  'Cung co Node.js, Express va kien truc routes-controller-service-model.': 'Củng cố Node.js, Express và kiến trúc routes - controller - service - model.',
  'Thiet ke schema MongoDB/Mongoose va CRUD API ro rang.': 'Thiết kế schema MongoDB/Mongoose và CRUD API rõ ràng.',
  'Lam JWT auth, validation, error handling va bao ve route.': 'Làm JWT auth, validation, xử lý lỗi và bảo vệ route.',
  'Them test API co ban, Docker/CI va deploy backend demo.': 'Thêm test API cơ bản, Docker/CI và triển khai backend demo.',
  'Tap trung vao nhung ky nang toi thieu de sinh vien co the demo nang luc Backend Developer, khong bat hoc tat ca ky nang con thieu.': 'Tập trung vào các kỹ năng tối thiểu để bạn có thể chứng minh năng lực Backend Developer mà không phải học dàn trải.',
  'GitHub hien co co dau hieu frontend, nen co the tan dung de mo rong sang san pham fullstack.': 'GitHub hiện có tín hiệu frontend, có thể tận dụng để mở rộng thành sản phẩm fullstack.',
  'Tang kha nang ung tuyen thuc tap/di lam bang cac dau hieu nha tuyen dung de kiem tra.': 'Tăng khả năng ứng tuyển bằng những tín hiệu nhà tuyển dụng thường kiểm tra.',
  'Chon repository co tin hieu tot nhat va viet lai README theo huong portfolio.': 'Chọn repository có tín hiệu tốt nhất và viết lại README theo hướng portfolio.',
  'Bo sung mot tinh nang nho the hien ro skill manh da co.': 'Bổ sung một tính năng nhỏ thể hiện rõ kỹ năng mạnh đã có.',
  'Ghi lai evidence: cong nghe dung, demo link, anh man hinh va cach chay project.': 'Ghi lại bằng chứng: công nghệ sử dụng, demo link, ảnh màn hình và cách chạy project.',
  'Chuan hoa README: problem, features, tech stack, setup, demo va screenshots.': 'Chuẩn hóa README: vấn đề, tính năng, tech stack, setup, demo và ảnh màn hình.',
  'Them test co ban cho flow quan trong nhat.': 'Thêm test cơ bản cho flow quan trọng nhất.',
  'Them Dockerfile hoac huong dan deploy don gian.': 'Thêm Dockerfile hoặc hướng dẫn deploy đơn giản.',
  'Chuan bi 3 gach dau dong giai thich dong gop ky thuat trong CV.': 'Chuẩn bị 3 gạch đầu dòng giải thích đóng góp kỹ thuật trong CV.'
}

const skillMap: Record<string, string> = {
  'java script': 'JavaScript',
  javascript: 'JavaScript',
  react: 'React',
  express: 'Express.js',
  jsonwebtoken: 'JWT',
  mongoose: 'Mongoose',
  dotenv: 'Environment Configuration',
  nodemon: 'Node.js',
  'express-session': 'Express Session',
  'connect-flash': 'Express Flash',
  'web-vitals': 'Web Vitals',
  'Backend Development': 'Backend Development',
  'JWT Authentication': 'JWT Authentication'
}

const stripBrokenEncoding = (value: string) =>
  value
    .replace(/Repo cÃ³ README, giÃºp ngÆ°á»i khÃ¡c hiá»ƒu má»¥c tiÃªu vÃ  cÃ¡ch sá»­ dá»¥ng project\./g, 'README rõ ràng')
    .replace(/Ä/g, 'Đ')
    .replace(/Ã/g, '')
    .replace(/Æ/g, '')
    .replace(/áº|á»/g, '')
    .trim()

const toUserText = (value?: string, fallback = '') => {
  if (!value) return fallback
  const direct = textMap[value] ?? roleLabels[value]
  if (direct) return direct

  let text = stripBrokenEncoding(value)

  const summaryMatch = text.match(/Lo trinh fallback duoc tao dua tren (\d+) repository.*muc tieu (.+)\./i)
  if (summaryMatch) {
    return `Lộ trình được tạo dựa trên ${summaryMatch[1]} repository đã phân tích và mục tiêu ${summaryMatch[2]}.`
  }

  text = text
    .replace(/\bLo trinh\b/gi, 'Lộ trình')
    .replace(/\bduoc tao dua tren\b/gi, 'được tạo dựa trên')
    .replace(/\bcac skill da phat hien\b/gi, 'các kỹ năng đã phát hiện')
    .replace(/\bva muc tieu\b/gi, 'và mục tiêu')
    .replace(/\bhien co\b/gi, 'hiện có')
    .replace(/\bco the\b/gi, 'có thể')
    .replace(/\bky nang\b/gi, 'kỹ năng')
    .replace(/\bcon thieu\b/gi, 'còn thiếu')
    .replace(/\bthuc hanh\b/gi, 'thực hành')
    .replace(/\bproject\b/gi, 'dự án')

  return text
}

const normalizeSkill = (skill?: string) => {
  if (!skill) return ''
  const cleaned = stripBrokenEncoding(skill).trim()
  const key = cleaned.toLowerCase()
  const normalized = skillMap[key] ?? skillMap[cleaned] ?? cleaned

  if (!normalized || normalized.length > 38 || normalized.includes(',')) return ''
  return normalized
}

const unique = (items: Array<string | undefined>) => {
  const seen = new Set<string>()

  return items.reduce<string[]>((result, item) => {
    const normalized = normalizeSkill(item)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) return result
    seen.add(key)
    result.push(normalized)
    return result
  }, [])
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const asNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const inferCategory = (targetRole = '', skills: string[] = []): RoadmapCategory => {
  const text = `${targetRole} ${skills.join(' ')}`.toLowerCase()

  if (text.includes('fullstack') || text.includes('full stack')) return 'Fullstack'
  if (text.includes('frontend') || text.includes('react') || text.includes('vue')) return 'Frontend'
  if (text.includes('backend') || text.includes('node') || text.includes('express') || text.includes('api')) return 'Backend'
  if (text.includes('devops') || text.includes('docker') || text.includes('cloud') || text.includes('ci/cd')) return 'DevOps'
  if (text.includes('mobile') || text.includes('react native') || text.includes('flutter')) return 'Mobile'
  if (text.includes('ai') || text.includes('machine learning') || text.includes('ml')) return 'AI/ML'
  if (text.includes('tester') || text.includes('test') || text.includes('qa')) return 'Testing'

  return 'Backend'
}

const inferDifficulty = (phases: RoadmapPhase[], tasks: RoadmapTask[]): RoadmapDifficulty => {
  const totalItems = phases.length + tasks.length
  const totalHours = tasks.reduce((sum, task) => sum + asNumber(task.estimatedHours, 4), 0)

  if (totalItems >= 12 || totalHours >= 80) return 'Advanced'
  if (totalItems >= 6 || totalHours >= 32) return 'Intermediate'
  return 'Beginner'
}

const normalizeStatus = (status?: string, index = 0): LearningNodeStatus => {
  if (status === 'completed') return 'completed'
  if (status === 'in-progress' || status === 'in_progress') return 'in-progress'
  if (status === 'locked') return 'locked'
  return index === 0 ? 'unlocked' : 'locked'
}

const normalizeResourceType = (type?: string): ResourceType => {
  const normalized = type?.toLowerCase()
  if (normalized === 'video' || normalized === 'docs' || normalized === 'course' || normalized === 'repo' || normalized === 'exercise') {
    return normalized
  }
  return 'article'
}

const phaseTasks = (phase: RoadmapPhase, fallbackIndex: number): RoadmapTask[] => {
  if (phase.tasks?.length) return phase.tasks

  return [{
    _id: phase._id,
    title: phase.title ?? `Giai đoạn ${fallbackIndex + 1}`,
    description: phase.goal ?? 'Hoàn thành các kỹ năng trọng tâm của giai đoạn này.',
    skillTags: phase.skills,
    status: phase.status,
    estimatedHours: Math.max(6, (phase.skills?.length ?? 1) * 4)
  }]
}

export const normalizeBackendRoadmap = (backend: BackendRoadmap): Roadmap => {
  const id = backend._id ?? backend.id ?? `roadmap-${Date.now()}`
  const phases = backend.mainPath?.phases ?? []
  const standaloneTasks = backend.tasks ?? []
  const allTasks = [...phases.flatMap(phaseTasks), ...standaloneTasks]
  const targetRole = backend.targetRole ?? backend.currentGithubDirection ?? 'Developer'
  const skills = unique([
    ...(backend.sourceContextSummary?.detectedSkills ?? []),
    ...phases.flatMap((phase) => phase.skills ?? []),
    ...allTasks.flatMap((task) => task.skillTags ?? [])
  ])
  const missingSkills = unique(backend.sourceContextSummary?.missingSkills ?? [])
  const title = toUserText(backend.mainPath?.title, `Roadmap ${targetRole}`)
  const reason = toUserText(backend.mainPath?.reason)
  const summary = toUserText(backend.summary, reason || `Lộ trình cá nhân hóa cho ${targetRole}`)
  const estimatedHours = Math.max(
    allTasks.reduce((sum, task) => sum + asNumber(task.estimatedHours, 4), 0),
    phases.length * 8,
    12
  )
  const completedTasks = allTasks.filter((task) => task.status === 'completed').length
  const progress = allTasks.length ? Math.round((completedTasks / allTasks.length) * 100) : 0
  const category = inferCategory(targetRole, skills)
  const difficulty = inferDifficulty(phases, allTasks)
  const slug = `${slugify(title || targetRole)}-${id}`

  const modules = (phases.length ? phases : [{ title: 'Lộ trình chính', goal: reason, tasks: standaloneTasks }]).map((phase, moduleIndex) => {
    const tasks = phaseTasks(phase, moduleIndex)

    return {
      id: phase._id ?? `${id}-module-${moduleIndex + 1}`,
      title: toUserText(phase.title, `Giai đoạn ${moduleIndex + 1}`),
      description: toUserText(phase.goal, reason || 'Các nhiệm vụ học tập được cá nhân hóa theo phân tích GitHub.'),
      order: moduleIndex + 1,
      estimatedHours: tasks.reduce((sum, task) => sum + asNumber(task.estimatedHours, 4), 0),
      nodes: tasks.map((task, taskIndex) => ({
        id: task._id ?? `${id}-node-${moduleIndex + 1}-${taskIndex + 1}`,
        title: toUserText(task.title, `Nhiệm vụ ${taskIndex + 1}`),
        description: toUserText(task.description, phase.goal ?? 'Hoàn thành nhiệm vụ này để tiến gần hơn tới mục tiêu nghề nghiệp.'),
        estimatedHours: asNumber(task.estimatedHours, 4),
        difficulty,
        dependencies: taskIndex === 0 ? [] : [tasks[taskIndex - 1]?._id ?? `${id}-node-${moduleIndex + 1}-${taskIndex}`],
        status: normalizeStatus(task.status, moduleIndex === 0 ? taskIndex : taskIndex + 1),
        skills: unique([...(task.skillTags ?? []), ...(phase.skills ?? [])]),
        resources: (task.resources ?? []).map((resource, resourceIndex) => ({
          id: resource._id ?? `${id}-resource-${moduleIndex + 1}-${taskIndex + 1}-${resourceIndex + 1}`,
          title: toUserText(resource.title, 'Tài nguyên học tập'),
          type: normalizeResourceType(resource.type),
          url: resource.url ?? '#',
          provider: resource.provider ?? 'AI Mentor',
          estimatedMinutes: asNumber(resource.estimatedMinutes, 30)
        })),
        project: toUserText(task.description),
        bookmarked: false,
        xp: Math.max(80, asNumber(task.estimatedHours, 4) * 30)
      })),
      milestones: [{
        id: `${id}-milestone-${moduleIndex + 1}`,
        title: `Hoàn thành ${toUserText(phase.title, `giai đoạn ${moduleIndex + 1}`)}`,
        description: toUserText(phase.goal, 'Đạt mục tiêu chính của giai đoạn.'),
        targetWeek: Math.max(1, (moduleIndex + 1) * 2),
        nodeIds: tasks.map((task, taskIndex) => task._id ?? `${id}-node-${moduleIndex + 1}-${taskIndex + 1}`),
        rewardXp: 250,
        completed: tasks.every((task) => task.status === 'completed')
      }]
    }
  })

  return {
    id,
    slug,
    title,
    subtitle: reason || summary,
    description: summary,
    category,
    difficulty,
    estimatedWeeks: Math.max(1, Math.ceil(estimatedHours / 8)),
    estimatedHours,
    requiredSkills: skills,
    objectives: [
      ...phases.map((phase) => toUserText(phase.goal)).filter(Boolean),
      ...(backend.supportingPaths ?? []).map((path) => toUserText(path.reason)).filter(Boolean)
    ].slice(0, 8),
    tags: unique([targetRole, category, ...skills]).slice(0, 8),
    popularity: 0,
    rating: 0,
    learners: backend.sourceContextSummary?.repositoriesCount ?? 0,
    isFeatured: false,
    isAIRecommended: true,
    progress,
    modules,
    createdFrom: 'ai',
    careerOutcome: roleLabels[targetRole] ?? targetRole,
    status: backend.status ?? 'active',
    createdAt: backend.createdAt,
    updatedAt: backend.updatedAt,
    sourceRepositoriesCount: backend.sourceContextSummary?.repositoriesCount ?? 0,
    missingSkills,
    supportingPaths: (backend.supportingPaths ?? []).map((path, index) => ({
      id: path._id ?? `${id}-support-${index + 1}`,
      title: toUserText(path.title, `Hướng bổ trợ ${index + 1}`),
      reason: toUserText(path.reason),
      skills: unique(path.skills ?? []),
      suggestedTasks: (path.suggestedTasks ?? []).map((task) => toUserText(task)).filter(Boolean)
    }))
  }
}

const buildRecommendation = (backend: BackendRoadmap): AIRecommendation => {
  const roadmap = normalizeBackendRoadmap(backend)
  const missingSkills = roadmap.missingSkills ?? []
  const detectedSkills = roadmap.requiredSkills
  const sourceCount = roadmap.sourceRepositoriesCount ?? 0
  const skillGaps: SkillGapAnalysis[] = missingSkills.map((skill, index) => ({
    skill,
    category: roadmap.category,
    currentScore: Math.max(15, 45 - index * 5),
    targetScore: 80,
    priority: index === 0 ? 'High' : 'Medium',
    evidence: `Kỹ năng ${skill} đang cần được bổ sung trong lộ trình hiện tại.`,
    recommendedNodeIds: roadmap.modules.flatMap((module) => module.nodes).slice(0, 2).map((node) => node.id)
  }))

  return {
    id: `ai-${roadmap.id}`,
    generatedAt: backend.updatedAt ?? backend.createdAt ?? new Date().toISOString(),
    summary: roadmap.description,
    confidence: Math.min(95, 72 + Math.min(sourceCount, 5) * 4),
    sourceRepositories: [`${sourceCount || 0} repository đã phân tích`],
    strengths: detectedSkills.length ? detectedSkills.slice(0, 4) : ['Đã có dữ liệu GitHub để cá nhân hóa lộ trình'],
    weaknesses: missingSkills.length ? missingSkills.slice(0, 4) : ['Chưa có kỹ năng thiếu nổi bật trong roadmap này'],
    missingSkills,
    commitPatternInsight: sourceCount > 0
      ? 'Lộ trình này được cá nhân hóa từ các repository đã phân tích.'
      : 'Hãy phân tích thêm repository để lộ trình chính xác hơn.',
    complexityInsight: roadmap.subtitle,
    careerSuggestion: roadmap.careerOutcome,
    estimatedCompletionWeeks: roadmap.estimatedWeeks,
    skillGaps,
    roadmap
  }
}

export const roadmapService = {
  async getRoadmaps(params: RoadmapListParams = { status: 'active' }): Promise<Roadmap[]> {
    const response = await apiClient.get('/roadmaps/me', { params })
    const roadmaps = extractApiResource<BackendRoadmap[]>(response.data, ['roadmaps'])
    return (roadmaps ?? []).map(normalizeBackendRoadmap)
  },

  async getRoadmapById(idOrSlug: string): Promise<Roadmap | undefined> {
    const slugParts = idOrSlug.split('-')
    const backendId = slugParts[slugParts.length - 1] ?? idOrSlug
    const response = await apiClient.get(`/roadmaps/${backendId}`)
    const roadmap = extractApiResource<BackendRoadmap>(response.data, ['roadmap'])
    return roadmap ? normalizeBackendRoadmap(roadmap) : undefined
  },

  async generateAIRoadmap(targetRole = 'Backend Developer', forceRegenerate = false): Promise<AIRecommendation> {
    const safeRole = roadmapTargetRoles.includes(targetRole as typeof roadmapTargetRoles[number])
      ? targetRole
      : 'Backend Developer'
    const response = await apiClient.post('/roadmaps/generate', { targetRole: safeRole, forceRegenerate })
    const roadmap = extractApiResource<BackendRoadmap>(response.data, ['roadmap'])
    return buildRecommendation(roadmap)
  },

  async archiveRoadmap(roadmapId: string): Promise<Roadmap> {
    const response = await apiClient.patch(`/roadmaps/${roadmapId}/archive`)
    const roadmap = extractApiResource<BackendRoadmap>(response.data, ['roadmap'])
    return normalizeBackendRoadmap(roadmap)
  }
}
