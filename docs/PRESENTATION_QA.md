# Presentation QA

## Q1. Tong quan flow he thong la gi?

### Tra loi ngan
Backend load repository cua user, lay GitHub account/package/commit/issue evidence, build Dev2Vec input, goi Python inference, map role/skill, luu AnalysisResult va tao snapshot. Response public di qua sanitizer, khong tra truc tiep token hay full debug noi bo.

### Bang chung trong source
- File: `src/services/analysis.service.js`
- Function: `analyzeRepository`
- Line: 616, 631, 644, 653, 700, 719, 755, 770, 792

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Flow phu thuoc GitHub account va artifact Dev2Vec local; neu GitHub/API/model loi thi co fallback rieng theo tung channel.

## Q2. He thong lay nhung gi tu repo?

### Tra loi ngan
He thong lay metadata repository, package/config files, source evidence co gioi han, markdown docs, commits, commit details, issues va API/dependency tokens. `package.json` duoc parse de lay packages/frameworks; source files duoc lay co quota va sanitize truoc khi dua vao model input.

### Bang chung trong source
- File: `src/services/github/github.package.service.js`
- Function: `fetchRepositoryPackages`
- Line: 380, 405, 438, 498, 557, 600, 618
- File: `src/services/dev2vec/dev2vecInputBuilder.service.js`
- Function: `buildRepositoryEvidence`
- Line: 1145, 1207, 1220, 1224, 1246, 1263

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Source evidence bi gioi han boi quota/size; khong phai moi file trong repo deu duoc dua vao model input.

## Q3. Du lieu GitHub nao duoc fetch that?

### Tra loi ngan
Backend goi GitHub API cho contents/package/source files, commit list, commit detail theo SHA va issues. Commit detail dung endpoint `/repos/{owner}/{repo}/commits/{sha}`; issue evidence dung GitHub issue service va co status channel rieng.

### Bang chung trong source
- File: `src/services/github/github.commit.service.js`
- Function: `fetchGithubCommits`, `fetchGithubCommitDetail`
- Line: 166, 185
- File: `src/services/github/github.issue.service.js`
- Function: `getRepositoryIssueEvidence`
- Line: search result shows service used by `analysis.service.js` line 707
- File: `src/services/analysis.service.js`
- Function: `analyzeRepository`
- Line: 700, 707

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
GitHub API can bi token/rate limit/quyen repo; khi fail, channel co the thanh `fetch_failed` hoac fallback cache.

## Q4. Co doc source code trong commit cua user khong?

### Tra loi ngan
Co. Sau khi match user commits, analysis goi commit detail voi `includeCodeEvidence: true`, parse patch neu co, hoac fetch file content tai commit khi can va trong quota; neu khong duoc thi fallback path-only.

### Bang chung trong source
- File: `src/services/analysis.service.js`
- Function: `analyzeRepository`
- Line: 651, 653, 659
- File: `src/services/github/github.commit.service.js`
- Function: `buildNormalizedCommitCodeEvidence`
- Line: 300, 339, 344, 366, 377, 379, 398

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Khong fetch vo han: co limit file, patch chars, content bytes, timeout va path-only fallback.

## Q5. Lam sao lay dung commit cua user?

### Tra loi ngan
Commit duoc normalize va match bang nhieu identity: author login, committer login, GitHub author id, verified email va fallback name. Filter user contribution chi giu commit ma `getCommitUserMatchInfo()` tra `matched=true`.

### Bang chung trong source
- File: `src/services/analysis/analysis.engine.js`
- Function: `getCommitUserMatchInfo`, `filterUserContributionCommits`
- Line: 215, 228, 229, 230, 232, 235, 244, 247
- File: `src/services/github/github.commit.service.js`
- Function: `normalizeCommit`
- Line: 142, 162

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Fallback name la match yeu va co nguy co trung ten; verified email phu thuoc du lieu account co san.

## Q6. Co ho tro main/master khong?

### Tra loi ngan
Co. Branch fetch commit lay theo `query.sha`, `query.branch`, `repository.defaultBranch`, `repository.rawData.default_branch`, roi moi fallback `main`. Neu DB co `master`, endpoint commit list se truyen `sha=master`.

### Bang chung trong source
- File: `src/services/github/github.commit.service.js`
- Function: `getBranchForCommitFetch`, `fetchGithubCommits`
- Line: 83, 166
- File: `src/services/analysis.service.js`
- Function: `getCommitBranch`, `loadRepositoryCommitsForAnalysis`
- Line: 548, 594, 606

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Neu repository metadata trong DB sai va GitHub metadata chua duoc refresh thi branch fallback co the khong dung cho repo moi.

## Q7. Dev2Vec dung nhung channel nao?

### Tra loi ngan
Dev2Vec dung 3 channel: `repoDocument`, `issueDocument`, va `apiTokens`. Runtime build channel availability, channel nao missing thi infer.py co the dung empty/zero vector de giu shape.

### Bang chung trong source
- File: `src/services/dev2vec/dev2vecInputBuilder.service.js`
- Function: `buildChannelAvailability`, `buildDev2VecInputFromRepositoryAnalysis`
- Line: 479, 1409, 1410, 1411
- File: `ml_service/infer.py`
- Function: `validate_input`, `run_inference`
- Line: 62, 63, 64, 297, 300, 303

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Artifact metadata noi artifact hien tai `supportsMissingChannels=false`; runtime co zero-vector fallback nhung artifact khong train voi missing-channel augmentation.

## Q8. Vi sao vector la 580 chieu?

### Tra loi ngan
580 = repo vector 230 + issue vector 150 + api vector 200. Python inference concatenate 3 vector nay thanh combined vector va validate dung 580 chieu.

### Bang chung trong source
- File: `ml_service/infer.py`
- Constant/Function: `VECTOR_DIMS`, `run_inference`
- Line: 19, 297, 300, 303, 307, 308
- File: `ml_service/artifacts/model_metadata.json`
- Field: `vectorDims`, `inputDimension`
- Line: 3, 29

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Kich thuoc 580 la contract artifact/runtime; doi kich thuoc can retrain va validate artifact moi.

## Q9. Model duoc train the nao?

### Tra loi ngan
Training script train 3 Doc2Vec model cho repo/issue/api, concatenate vector, roi train LogisticRegression classifier. Script cung ghi label encoder, classifier, skill prototypes, skill vectors va metadata.

### Bang chung trong source
- File: `ml_service/train.py`
- Function: `train_doc2vec`, `main`
- Line: 240, 354, 355, 356, 357, 358, 376, 393, 396, 398, 401, 403, 410
- File: `ml_service/artifacts/model_metadata.json`
- Field: `trainingStrategy`, `dataset`
- Line: 12, 38

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Metadata hien tai ghi sampleCount 75, moi role 15 sample; day la demo/small dataset theo artifact hien co.

## Q10. Du an co retrain model trong production khong?

### Tra loi ngan
Khong thay production flow nao goi train.py. `train.py` tu ghi ro la train local va khong chay production; runtime chi load artifacts va infer.

### Bang chung trong source
- File: `ml_service/train.py`
- Module docstring
- Line: 2
- File: `ml_service/infer.py`
- Function: `run_inference`
- Line: 276, 277, 278, 279, 280, 281, 283
- File: `src/services/dev2vec/dev2vec.service.js`
- Function: `runDev2VecInference`
- Line: 137

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Co script train local; tai lieu nay khong xac nhan quy trinh MLOps ngoai repo.

## Q11. Role score lay tu dau?

### Tra loi ngan
Role score den tu Python inference: classifier `predict_proba` tao probabilities, sau do rank roles. Backend map probability sang percent cho match score/summary.

### Bang chung trong source
- File: `ml_service/infer.py`
- Function: `run_inference`, `rank_roles`
- Line: 210, 312, 314, 346
- File: `src/services/dev2vec/dev2vecRoleMapper.service.js`
- Function: `mapPredictionToRoleMatch`, `buildAnalysisSummaryFromDev2Vec`
- Line: 76, 167

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Metadata roleScoring la `classifier_only`, calibration none; score la classifier probability, khong phai calibrated industry score.

## Q12. Skill score lay tu dau va cong thuc nhan len 100 la gi?

### Tra loi ngan
Skill score public lay tu `skillGaps[role].details[].similarity` do Dev2Vec/Python tra ve. Backend convert bang `Math.round(raw * 10000) / 100`, tuc raw 0-1 thanh 0-100 voi toi da 2 chu so thap phan.

### Bang chung trong source
- File: `ml_service/infer.py`
- Function: `build_skill_gap`
- Line: 236, 245
- File: `src/services/dev2vec/dev2vecRoleMapper.service.js`
- Function: `toPercentScore`, `getEmbeddingScoreForSkill`
- Line: 22, 254
- File: `scripts/testDev2VecRoleMapper.js`
- Fixture: raw score regression
- Line: 126, 138, 139, 140, 152

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Skill score la cosine similarity voi skill prototype sau normalize; khong phai diem bai test nang luc.

## Q13. Khi nao skill vao missingSkills?

### Tra loi ngan
Trong mapper hien tai, skill vao `missingSkills` khi final score bang 0. Skill co score > 0 vao `topSkills`, khong duoc dong thoi xuat hien trong missing.

### Bang chung trong source
- File: `src/services/dev2vec/dev2vecRoleMapper.service.js`
- Function: `buildAnalysisSkillsFromDev2Vec`
- Line: 347, 348, 400, 401
- File: `scripts/testDev2VecRoleMapper.js`
- Fixture: no duplicate top/missing
- Line: 152, 156, 157, 161, 164

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Neu model khong co detail similarity cho skill thi backend normalize ve 0 va coi la missing.

## Q14. User level/band duoc chia the nao?

### Tra loi ngan
User level trong summary duoc chia tu top role match score: >=70 la `intermediate`, >=40 la `beginner`, con lai la `novice`. Score nay den tu role probability da nhan len percent.

### Bang chung trong source
- File: `src/services/dev2vec/dev2vecRoleMapper.service.js`
- Function: `buildAnalysisSummaryFromDev2Vec`
- Line: 167, 168, 170, 175

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Khong thay band `advanced` trong summary mapper hien tai.

## Q15. Issue evidence co duoc lay that khong?

### Tra loi ngan
Co. Analysis goi `getRepositoryIssueEvidence`, sau do chi dua issues vao model khi channel status la `available`; neu loi/rate limit thi status thanh `fetch_failed`/`rate_limited`/`not_fetched`.

### Bang chung trong source
- File: `src/services/analysis.service.js`
- Function: `analyzeRepository`, `getIssueChannelStatus`, `getModelIssues`
- Line: 700, 707, 840, 851
- File: `src/models/RepositoryIssue.js`
- Schema: issue cache model
- Line: file exists in source tree

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Chat/user-related relevance cua issue phu thuoc implementation issue service va du lieu GitHub thuc te.

## Q16. API calls/dependency tokens co duoc lay that khong?

### Tra loi ngan
Co token tu package records, source usage parser va analysis source duoc normalize thanh `apiTokens`. Source usage parser doc sourceContent va sinh token nhu client HTTP/server route/database/devops/data tuy pattern trong source.

### Bang chung trong source
- File: `src/services/dev2vec/dev2vecInputBuilder.service.js`
- Function: `normalizeApiTokens`, `buildRepositoryEvidence`
- Line: 456, 1224
- File: `src/services/dev2vec/sourceUsageParser.service.js`
- Function: `parseSourceUsageEvidence`
- Line: 225
- File: `scripts/regressionDev2VecRoleFixtures.js`
- Assertions: frontend/backend/devops/data api tokens
- Line: 42, 86, 109, 130

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Parser la static pattern parser, khong execute code va khong resolve runtime call graph.

## Q17. RoleMatch sinh nhu the nao?

### Tra loi ngan
RoleMatch dung Dev2Vec output, map `rolePredictions` sang matches, sort/rank theo rank tu inference va co the filter target role. Neu cache hop le thi dung Dev2Vec cached result; neu khong thi rebuild input va run inference.

### Bang chung trong source
- File: `src/services/analysis.service.js`
- Function: `mapRoleMatchesFromDev2Vec`, `getDev2VecOutputForSingleRepo`
- Line: 835, 916, 918, 943
- File: `src/services/dev2vec/dev2vecRoleMapper.service.js`
- Function: `mapDev2VecOutputToRoleMatches`
- Line: 107

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
RoleMatch phu thuoc artifact classifier va targetRole filter; neu requested role khong co prediction co the rong.

## Q18. Missing skill di vao roadmap ra sao?

### Tra loi ngan
Roadmap skill gap context lay missingSkills/recommendedNextSkills tu role match, skill gaps va analysis missingSkills. Prompt roadmap yeu cau task dung canonical skills tu skillGapSummary/skillGaps.

### Bang chung trong source
- File: `src/services/roadmapSkillGap.service.js`
- Function: `buildRoadmapSkillGapContext`
- Line: 406, 407
- File: `src/services/roadmap.service.js`
- Function: `generateRoadmap`
- Line: 1334, 1351, 1437, 1456, 1471
- File: `src/services/ai/roadmap.prompt.js`
- Function: `buildRoadmapPrompt`
- Line: 33, 38

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Roadmap generation goi AI service; quality phu thuoc prompt va model AI ben ngoai.

## Q19. Video YouTube co duoc kiem tra truoc khi tra khong?

### Tra loi ngan
Co kiem tra muc co ban. Service goi YouTube Search API neu co `YOUTUBE_API_KEY`, loai Shorts/ket qua thieu title/url, cham diem title/channel/keyword va chi giu video score >=40; truoc do uu tien curated catalog neu co.

### Bang chung trong source
- File: `src/services/youtube.service.js`
- Function: `isLikelyShort`, `calculateYouTubeVideoScore`, `searchYoutubeVideos`
- Line: 5, 11, 62, 101, 104, 111
- File: `src/services/learning.service.js`
- Function: `searchAndCacheYoutubeResources`
- Line: 381, 427, 431, 450, 461

### Trang thai
- PARTIALLY_IMPLEMENTED

### Han che
Khong thay code goi YouTube video details de verify duration/availability/license; search validation la heuristic tren search result.

## Q20. Co luu raw source/patch trong DB khong?

### Tra loi ngan
Package/source evidence co luu `sourceContent` trong `RepositoryPackage.detectedFiles` va `rawData` co cache metadata. Commit code evidence model luu normalized signals/hash/filename, khong luu raw content/patch; commit detail co field `files`, patch chi duoc include neu config patchMaxChars > 0.

### Bang chung trong source
- File: `src/models/RepositoryPackage.js`
- Schema: `detectedFiles`, `rawData`
- Line: 9, 33
- File: `src/models/RepositoryCommitCodeEvidence.js`
- Schema: normalized evidence fields
- Line: 7, 12, 17, 18, 19, 20
- File: `src/services/github/github.commit.service.js`
- Function: `normalizeCommitFile`, `buildNormalizedCommitCodeEvidence`
- Line: 109, 118, 339, 344, 398

### Trang thai
- PARTIALLY_IMPLEMENTED

### Han che
Repo package sourceContent co the la raw source snippet/content co gioi han; commit evidence khong luu raw full patch/content trong model rieng.

## Q21. Cache hoat dong the nao?

### Tra loi ngan
Commit list cache TTL mac dinh 15 phut; commit detail cache TTL mac dinh 24 gio. Dev2Vec cache dung metadata version va repository fingerprint; `forceRegenerate` bo cache Dev2Vec.

### Bang chung trong source
- File: `src/services/github/github.commit.service.js`
- Constants/Function: cache TTL/detail cache
- Line: 20, 21, 44, 50, 92, 403
- File: `src/services/dev2vec/dev2vecCachePolicy.service.js`
- Function: `shouldUseCachedDev2Vec`, `compareMetadata`, `getRepositoryFingerprint`
- Line: 25, 52, 71, 77, 81
- File: `src/services/analysis.service.js`
- Function: `getDev2VecOutputForSingleRepo`
- Line: 916, 918, 943

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Cache correctness phu thuoc repository fingerprint co du du lieu pushedAt/defaultBranchSha hay khong.

## Q22. Performance va security dang duoc xu ly the nao?

### Tra loi ngan
Pipeline co timers, concurrency limit, file/source quotas, max pages, max file bytes va debug log co dieu kien env. GitHub token duoc lay bang `select('+accessToken')` va khong thay log token trong debug commit/detail.

### Bang chung trong source
- File: `src/services/analysis.service.js`
- Function: `analyzeRepository`
- Line: 626, 644, 653, 777
- File: `src/services/github/github.commit.service.js`
- Constants/Functions: limits/concurrency/detail fetch
- Line: 54, 58, 63, 300, 357, 572
- File: `src/services/github/github.commit.service.js`
- Function: detail fetch error log
- Line: 561

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Network calls van phu thuoc GitHub latency/rate limit; tai lieu nay khong do performance production thuc te.

## Q23. Tests hien co chung minh nhung phan nao?

### Tra loi ngan
Repo co regression tests cho Dev2Vec role fixtures, input builder, role mapper, commit flow, package pipeline, source usage, issue evidence, cache/performance va backend analysis fixes. Contract 580 dimensions duoc validate trong Python contract test va regression fixture.

### Bang chung trong source
- File: `scripts/regressionDev2VecRoleFixtures.js`
- Assertions: vector dims, role prediction order, api tokens
- Line: 221, 226, 228, 230, 238
- File: `scripts/testDev2VecRoleMapper.js`
- Raw score regression
- Line: 126, 152, 156, 164
- File: `scripts/testGithubCommitAnalysisFlow.js`
- Fixture: branch/user matching
- Line: file exists in source tree
- File: `ml_service/validate_contract.py`
- Function: contract validation
- Line: 45, 48, 52, 53, 57

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Khong phai tat ca tests deu duoc chay trong task tao tai lieu nay; day la audit source/tests hien co.

## Q24. Han che hien tai la gi?

### Tra loi ngan
Artifact hien tai la demo classifier voi 75 samples, `supportsMissingChannels=false`, calibration none va training khong chay production. Source/API parsing la static evidence, YouTube validation la search-result heuristic, va GitHub evidence phu thuoc token/rate limit/cache.

### Bang chung trong source
- File: `ml_service/artifacts/model_metadata.json`
- Fields: `dataset`, `supportsMissingChannels`, `roleScoring`
- Line: 8, 11, 34, 38
- File: `src/services/youtube.service.js`
- Function: `searchYoutubeVideos`
- Line: 62, 101, 111
- File: `src/services/github/github.commit.service.js`
- Function: detail fallback
- Line: 549, 553, 561

### Trang thai
- VERIFIED_IMPLEMENTED

### Han che
Muon claim chat luong model cao can them evaluation/runtime test ngoai cac artifact/test hien co.

# 10 cau hoi de bi hoi sau nhat

1. Vi sao 580 chieu? Tra loi: 230 repo + 150 issue + 200 api, concatenate trong `ml_service/infer.py`.
2. Role score co phai diem nang luc khong? Khong; la classifier probability da map sang percent.
3. Skill score co bonus evidence khong? Khong trong mapper hien tai; lay `details[].similarity * 100`.
4. Missing skill co phai khong co evidence source khong? Khong nhat thiet; policy hien tai la score normalize bang 0.
5. Co doc commit cua dung user khong? Co, match bang login/id/email/name fallback roi fetch detail cho user commits.
6. Co doc full repo khong? Co doc selected package/source/docs evidence theo quota, khong doc vo han moi file.
7. Main/master xu ly the nao? Dung defaultBranch/rawData default_branch/query sha, fallback main.
8. Issue/API channel missing thi sao? Runtime giu shape bang empty/zero channel, nhung artifact khong train missing-channel augmentation.
9. YouTube co dam bao video con xem duoc khong? Khong dam bao tuyet doi; chi filter search result va score heuristic.
10. Co retrain model khi user analyze repo khong? Khong; production inference load artifact co san.

# Cac claim khong nen noi qua

- Khong noi model da duoc train tren dataset lon; metadata ghi 75 samples.
- Khong noi score la muc do thanh thao chuan hoa industry; role score la classifier probability, skill score la similarity.
- Khong noi YouTube video da duoc verify duration/availability bang video details API.
- Khong noi he thong doc toan bo repo khong gioi han; co quota va cache.
- Khong noi missing-channel training da co; metadata ghi artifact hien tai khong train missing-channel augmentation.
- Khong noi commit name fallback la xac thuc chac chan; chi la fallback yeu.

# Demo checklist

- Chon repo da connect GitHub account va co default branch dung.
- Chay analysis voi repo co package/source/commit cua user.
- Kiem tra `analysisScope.totalRepoCommits` va `analysisScope.userCommits`.
- Kiem tra `dev2vec.sourceStats`: `sourceFileCount`, `apiTokenCount`, `userContributionFileCount`.
- Kiem tra `dev2vec.vectorDims.combined = 580`.
- Kiem tra `dev2vec.rolePredictions` co probability va rank.
- Kiem tra topSkills/missingSkills khong trung nhau.
- Neu demo learning, chuan bi curated resource hoac `YOUTUBE_API_KEY`.
- Neu demo regenerate, dung `forceRegenerate` va giai thich cache.

# Flow thuyet trinh 5 phut

1. 30s: Noi input la GitHub repo cua user, backend lay metadata/package/source/commit/issue.
2. 45s: Giai thich user contribution: match commit theo GitHub identity, fetch commit detail, parse patch/file-at-commit co quota.
3. 60s: Giai thich Dev2Vec input 3 channel: repo, issue, api; vector 580 = 230 + 150 + 200.
4. 45s: Giai thich model: Doc2Vec per channel + LogisticRegression classifier, runtime chi infer, khong retrain.
5. 45s: Giai thich role/skill: role probability tu classifier, skill similarity tu prototype, score = raw * 100.
6. 45s: Giai thich missing/roadmap: score 0 la missing, missingSkills vao roadmap prompt va skill gap context.
7. 30s: Giai thich learning resource: curated truoc, YouTube API neu co key, filter heuristic.
8. 30s: Ket thuc bang limitations: small artifact, quota, GitHub/API dependency, YouTube validation khong tuyet doi.
