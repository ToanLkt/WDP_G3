# BE Project Structure & Development Rules

Dự án BE sử dụng stack:

```txt
Node.js + Express.js + MongoDB + Mongoose
```

Mục tiêu BE:

- Cung cấp REST API cho web/mobile.
- Kết nối GitHub của sinh viên.
- Lấy repository, README, package/config files, commit history.
- Phân tích repo để tạo skill signals.
- Gửi dữ liệu phân tích vào AI để tạo feedback, learning guideline và chatbot context.
- Lưu lịch sử phân tích để theo dõi tiến độ theo thời gian.

---

## 1. Folder Structure

```txt
career-roadmap-be/
│
├── src/
│   ├── app.js
│   │
│   ├── config/
│   │   ├── database.js
│   │   ├── env.js
│   │   └── github.config.js
│   │
│   ├── common/
│   │   ├── constants/
│   │   │   ├── roles.constant.js
│   │   │   ├── status.constant.js
│   │   │   └── analysis.constant.js
│   │   │
│   │   ├── helpers/
│   │   │   ├── apiResponse.helper.js
│   │   │   ├── asyncHandler.helper.js
│   │   │   └── pagination.helper.js
│   │   │
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js
│   │   │   ├── error.middleware.js
│   │   │   ├── notFound.middleware.js
│   │   │   └── validate.middleware.js
│   │   │
│   │   └── utils/
│   │       ├── generateToken.util.js
│   │       ├── password.util.js
│   │       ├── githubParser.util.js
│   │       └── skillMapper.util.js
│   │
│   ├── models/
│   │   ├── User.model.js
│   │   ├── StudentProfile.model.js
│   │   ├── GithubAccount.model.js
│   │   ├── Repository.model.js
│   │   ├── AnalysisSnapshot.model.js
│   │   ├── SkillSignal.model.js
│   │   ├── ChatSession.model.js
│   │   ├── ChatMessage.model.js
│   │   ├── LearningRecommendation.model.js
│   │   └── Roadmap.model.js
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   └── auth.validation.js
│   │   │
│   │   ├── users/
│   │   │   ├── user.routes.js
│   │   │   ├── user.controller.js
│   │   │   └── user.service.js
│   │   │
│   │   ├── profiles/
│   │   │   ├── profile.routes.js
│   │   │   ├── profile.controller.js
│   │   │   ├── profile.service.js
│   │   │   └── profile.validation.js
│   │   │
│   │   ├── github/
│   │   │   ├── github.routes.js
│   │   │   ├── github.controller.js
│   │   │   ├── github.service.js
│   │   │   ├── github.fetcher.js
│   │   │   └── github.validation.js
│   │   │
│   │   ├── repositories/
│   │   │   ├── repository.routes.js
│   │   │   ├── repository.controller.js
│   │   │   └── repository.service.js
│   │   │
│   │   ├── analysis/
│   │   │   ├── analysis.routes.js
│   │   │   ├── analysis.controller.js
│   │   │   ├── analysis.service.js
│   │   │   ├── commitAnalyzer.service.js
│   │   │   ├── packageAnalyzer.service.js
│   │   │   ├── repoAnalyzer.service.js
│   │   │   └── skillSignal.service.js
│   │   │
│   │   ├── ai/
│   │   │   ├── ai.routes.js
│   │   │   ├── ai.controller.js
│   │   │   ├── ai.service.js
│   │   │   └── prompts/
│   │   │       ├── githubFeedback.prompt.js
│   │   │       ├── learningGuideline.prompt.js
│   │   │       └── chatContext.prompt.js
│   │   │
│   │   ├── chat/
│   │   │   ├── chat.routes.js
│   │   │   ├── chat.controller.js
│   │   │   └── chat.service.js
│   │   │
│   │   ├── progress/
│   │   │   ├── progress.routes.js
│   │   │   ├── progress.controller.js
│   │   │   └── progress.service.js
│   │   │
│   │   └── roadmaps/
│   │       ├── roadmap.routes.js
│   │       ├── roadmap.controller.js
│   │       └── roadmap.service.js
│   │
│   ├── routes/
│   │   └── index.js
│   │
│   └── docs/
│       ├── api-overview.md
│       ├── env-example.md
│       └── postman-guide.md
│
├── tests/
│   ├── auth.test.js
│   ├── github.test.js
│   ├── analysis.test.js
│   └── chat.test.js
│
├── server.js
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 2. Main API Groups

### Auth APIs

```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh-token
GET  /api/auth/me
```

### Student Profile APIs

```txt
POST  /api/profiles
GET   /api/profiles/me
PATCH /api/profiles/me
```

### GitHub APIs

```txt
POST /api/github/token
GET  /api/github/repositories
GET  /api/github/repositories/:repoId
GET  /api/github/repositories/:repoId/readme
GET  /api/github/repositories/:repoId/commits
GET  /api/github/repositories/:repoId/packages
```

### Analysis APIs

```txt
POST /api/analysis/repositories/:repoId
GET  /api/analysis/results/:repoId
GET  /api/analysis/me
GET  /api/analysis/:analysisId
```

### AI APIs

```txt
POST /api/ai/analyze/:analysisId
POST /api/ai/generate-feedback/:analysisId
GET  /api/ai/feedbacks/me
GET  /api/ai/feedbacks/:feedbackId
```

### Chat APIs

```txt
POST /api/chat/sessions
GET  /api/chat/sessions
GET  /api/chat/sessions/:sessionId
POST /api/chat/sessions/:sessionId/messages
```

### Progress APIs

```txt
POST /api/progress/snapshots
GET  /api/progress/snapshots/me
GET  /api/progress/compare
```

### Roadmap APIs

```txt
POST  /api/roadmaps/generate
GET   /api/roadmaps/me
PATCH /api/roadmaps/:roadmapId/progress
```

---

## 3. Development Rules

### Rule 1: Use Express Layered Architecture

Mỗi module phải chia tối thiểu thành:

```txt
routes → controller → service → model
```

Không viết toàn bộ logic trực tiếp trong route.

Ví dụ:

```txt
auth.routes.js       định nghĩa endpoint
auth.controller.js   nhận request và trả response
auth.service.js      xử lý logic đăng ký/đăng nhập
User.model.js        làm việc với MongoDB
```

---

### Rule 2: Use Mongoose Models for Database Access

Tất cả thao tác với MongoDB phải đi qua Mongoose model.

Không gọi database trực tiếp trong route.

Tên model nên dùng format:

```txt
User.model.js
StudentProfile.model.js
Repository.model.js
AnalysisSnapshot.model.js
```

---

### Rule 3: Use Environment Variables

Không hard-code secret key, database URI, GitHub token hoặc AI API key trong code.

Dùng `.env`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/career_roadmap_db
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
GITHUB_TOKEN=
OPENAI_API_KEY=
```

Bắt buộc có `.env.example` để team biết cần cấu hình gì.

---

### Rule 4: Protect Private Routes with JWT Middleware

Các API liên quan đến profile, GitHub, analysis, AI, chat, progress, roadmap đều phải cần đăng nhập.

Ví dụ:

```txt
/api/auth/register       public
/api/auth/login          public
/api/profiles/me         protected
/api/github/repositories protected
/api/analysis/me         protected
/api/chat/sessions       protected
```

---

### Rule 5: Password Must Be Hashed

Password không được lưu plain text.

Dùng `bcryptjs` để hash password trước khi lưu vào MongoDB.

---

### Rule 6: Standard API Response Format

Tất cả API nên trả về cùng một format.

Success response:

```json
{
  "success": true,
  "message": "Request successful",
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "message": "Error message",
  "errors": []
}
```

---

### Rule 7: Use asyncHandler for Controllers

Không lặp lại `try/catch` quá nhiều trong controller.

Nên dùng helper `asyncHandler` để bắt lỗi async.

Ví dụ:

```js
const asyncHandler = require("../../common/helpers/asyncHandler.helper");

const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});
```

---

### Rule 8: Validate Request Body

Các API nhận body phải validate dữ liệu.

Ví dụ:

- Register: email, password, fullName bắt buộc.
- Login: email, password bắt buộc.
- GitHub token: token bắt buộc.
- Profile: year phải là số.

Có thể dùng middleware tự viết hoặc thư viện như `joi`, `zod`, `express-validator`.

---

### Rule 9: GitHub MVP Uses Personal Access Token First

Trong MVP, ưu tiên dùng GitHub Personal Access Token thay vì OAuth để làm nhanh.

Flow MVP:

```txt
User nhập GitHub token
BE kiểm tra token bằng GitHub API
BE lưu token đã mã hóa hoặc lưu an toàn
BE dùng token để fetch repositories
```

OAuth có thể để giai đoạn sau.

---

### Rule 10: Limit GitHub Data Fetching

Không fetch toàn bộ repository quá lớn trong MVP.

Giới hạn đề xuất:

```txt
Repositories: có phân trang
Commits: 100-300 commit gần nhất
Source files: chỉ fetch file extension được whitelist
File size: bỏ qua file quá lớn
```

Whitelist source file:

```txt
.js, .ts, .jsx, .tsx, .java, .py, .dart
```

Config/package files cần kiểm tra:

```txt
package.json
requirements.txt
pom.xml
build.gradle
pubspec.yaml
Dockerfile
docker-compose.yml
.github/workflows
```

---

### Rule 11: Analysis Should Be Rule-Based First

Không phụ thuộc hoàn toàn vào AI ngay từ đầu.

MVP nên phân tích rule-based trước:

- Ngôn ngữ chính.
- Framework/library.
- README có hay không.
- Có test hay không.
- Có Docker hay không.
- Có CI/CD hay không.
- Commit message rõ hay chung chung.
- Repo update đều hay chỉ upload một lần.

Sau đó mới gửi summary vào AI.

---

### Rule 12: LLM Receives Clean Summary, Not Raw Repository

Không gửi toàn bộ code/repo thô vào AI.

Chỉ gửi summary đã xử lý:

```json
{
  "repoSummary": {},
  "packages": [],
  "commitSummary": {},
  "skillSignals": [],
  "missingSignals": [],
  "studentProfile": {}
}
```

AI output nên có:

```txt
strengths
weaknesses
careerDirectionSuggestions
skillGaps
learningRecommendations
repoImprovementSuggestions
```

---

### Rule 13: Store Analysis Snapshots

Mỗi lần phân tích repo phải lưu snapshot.

Mục đích:

- Xem lịch sử phân tích.
- So sánh tiến độ theo thời gian.
- Làm dashboard progress.
- Làm chatbot context.

Không chỉ trả kết quả tạm thời rồi mất dữ liệu.

---

### Rule 14: Chatbot Must Use User Context

Chatbot không trả lời chung chung.

Khi user hỏi, chatbot nên dùng context từ:

```txt
StudentProfile
Repository
AnalysisSnapshot
SkillSignal
LearningRecommendation
```

Ví dụ câu hỏi:

```txt
Tôi nên học gì tiếp theo?
```

Chatbot phải dựa vào repo và analysis của user để trả lời.

---

### Rule 15: Keep MVP Small

Không làm quá nhiều tính năng nâng cao trong MVP.

Ưu tiên MVP:

```txt
Auth
Student Profile
GitHub token connect
Fetch repositories
Fetch README/package/commits
Analyze repo rule-based
Generate AI feedback
Chat with GitHub context
Save analysis snapshot
```

Để sau MVP:

```txt
GitHub OAuth
Deep source code analysis
Issue analysis
Embedding/dev2vec-like model
Portfolio readiness score
Progress comparison dashboard
```

---

## 4. Coding Convention

### File Naming

Dùng camelCase hoặc module prefix rõ ràng.

```txt
auth.routes.js
auth.controller.js
auth.service.js
User.model.js
```

### Function Naming

Dùng tên rõ nghĩa:

```js
registerUser();
loginUser();
getCurrentUser();
connectGithubToken();
fetchUserRepositories();
analyzeRepository();
generateLearningGuideline();
```

### Response Messages

Dùng tiếng Anh trong API response để thống nhất với FE/mobile:

```json
{
  "success": true,
  "message": "Login successful"
}
```

UI có thể dịch sang tiếng Việt ở phía frontend/mobile.

---

## 5. Suggested BE Implementation Order

### Phase 1: Backend Foundation

```txt
BE-01 Project Setup
BE-02 Database Schema Design
BE-03 Auth
BE-03.1 Student Profile
BE-24 Validation and Error Handling
```

### Phase 2: GitHub Fetching

```txt
BE-04 GitHub Token Connection
BE-05 Fetch Repository List
BE-06 Fetch README and Metadata
BE-07 Detect Package/Config Files
BE-08 Fetch Commit History
```

### Phase 3: Analysis Core

```txt
BE-09 Analyze Commit Quality
BE-10 Repository Detail Analysis Engine
BE-11 Extract Skill Signals
BE-15 Save Analysis Snapshot
BE-16 Analysis Result Endpoint
```

### Phase 4: AI and Chatbot

```txt
BE-12 LLM Prompt Orchestration
BE-13 Chat Session API
BE-14 Generate Learning Guideline
```

### Phase 5: Testing and Deployment

```txt
BE-24 API Validation and Error Handling
BE-25 Backend Unit/Integration Tests
BE-26 Backend Deployment Setup
BE-27 API Documentation
```

---

## 6. Recommended Package List

Install core packages:

```bash
npm install express mongoose dotenv cors bcryptjs jsonwebtoken axios
```

Install dev packages:

```bash
npm install -D nodemon
```

Optional validation/testing packages:

```bash
npm install joi
npm install -D jest supertest
```

---

## 7. Do Not Do These

Không làm các việc sau trong MVP:

```txt
Không làm GitHub OAuth nếu PAT đã đủ demo.
Không fetch toàn bộ code của repo lớn.
Không gửi raw source code quá nhiều vào AI.
Không hard-code token/API key.
Không lưu password plain text.
Không viết logic lớn trong route.
Không bỏ qua error handling.
Không làm embedding/dev2vec ngay từ đầu.
```

---

## 8. Definition of Done for BE MVP

BE MVP được xem là hoàn thành khi có đủ:

```txt
1. User đăng ký / đăng nhập được.
2. User cập nhật student profile được.
3. User kết nối GitHub bằng token được.
4. BE lấy được danh sách repo GitHub.
5. BE lấy được README, package/config files, commit history.
6. BE phân tích repo thành skill signals.
7. BE tạo được AI feedback hoặc mock feedback nếu chưa có key.
8. Chatbot trả lời dựa trên GitHub analysis context.
9. Analysis snapshot được lưu vào MongoDB.
10. Có Postman Collection hoặc API docs cho mobile/web.
```
