# BE1 Dev2Vec/ML Current Status

Audit date: 2026-07-06  
Scope: read-only audit of current `ml_service/**`. No source logic was changed.

## 1. `ml_service` folder structure

```text
ml_service/
  README.md
  infer.py
  requirements.txt
  train.py
  validate_contract.py
  artifacts/
    doc2vec_api.model
    doc2vec_issue.model
    doc2vec_repo.model
    label_encoder.joblib
    model_metadata.json
    role_classifier.joblib
    skill_prototypes.json
    skill_vectors.json
  dataset/
    dataset_summary.json
    developers.extracted.json
    developers.seed.json
  extractors/
    api_document.py
    github_fetcher.py
    issues_document.py
    repo_document.py
    text_cleaner.py
```

Main files:

| File | Current responsibility |
|---|---|
| `train.py` | Local/offline training script. Reads extracted developer dataset, trains three Doc2Vec models, trains Logistic Regression role classifier, writes artifacts and metadata. |
| `infer.py` | Production inference entrypoint. Loads artifacts, accepts JSON input, emits exactly one JSON document to stdout. |
| `validate_contract.py` | Contract smoke test for `infer.py`; invokes inference through stdin and validates output schema/vector dimensions/topN cap/zero-vector fallback. |
| `requirements.txt` | Python dependencies: `requests`, `numpy`, `gensim`, `scikit-learn`, `joblib`. |
| `README.md` | BE2-facing guide describing architecture, setup, crawler, training, inference input/output, error handling, role mapping and ownership rules. Text encoding appears mojibake when read in this shell, but content is understandable. |
| `extractors/repo_document.py` | Builds repository text from GitHub repo metadata, topics, languages, README, config files, commit messages and changed file paths. |
| `extractors/issues_document.py` | Builds issue text from issue title/body/labels and issue comments. Pull requests are filtered out. |
| `extractors/api_document.py` | Parses dependency/API tokens from package/config files. |
| `extractors/github_fetcher.py` | GitHub API crawler CLI. Reads seed dataset, fetches repos/issues/configs, writes `developers.extracted.json` and `dataset_summary.json`. |
| `extractors/text_cleaner.py` | Normalizes text, strips code blocks/URLs/HTML, lowercases and trims length. |
| `dataset/*` | Seed dataset, extracted developer-level dataset, and extraction summary. |
| `artifacts/*` | Trained Doc2Vec models, classifier/encoder, skill prototypes/vectors, and model metadata. |

## 2. Current artifacts

Files in `ml_service/artifacts`:

| File | Required for inference? | Purpose |
|---|---:|---|
| `doc2vec_repo.model` | Yes | Infers 230-dim repo vector. |
| `doc2vec_issue.model` | Yes | Infers 150-dim issue vector. |
| `doc2vec_api.model` | Yes | Infers 200-dim API/dependency vector. |
| `role_classifier.joblib` | Yes | Logistic Regression classifier over 580-dim combined vector. |
| `label_encoder.joblib` | Yes | Converts classifier class ids back to model labels. |
| `skill_vectors.json` | Yes | Role-keyed skill prototype vectors used for skill gap calculation. |
| `model_metadata.json` | Yes in current code | Loaded by `infer.py` for `modelVersion`; if missing, inference fails. |
| `skill_prototypes.json` | No | Debug/training reference. Not loaded by `infer.py`. |

`model_metadata.json` exists and currently has these top-level fields:

```text
status
modelVersion
trainedAt
roles
roleIds
vectorDims
dataset
artifacts
```

Current metadata values:

```json
{
  "status": "ready",
  "modelVersion": "dev2vec-demo-v1",
  "trainedAt": "2026-07-06T07:06:34.458Z",
  "roles": ["Backend", "Frontend", "Mobile", "DevOps", "Data Scientist"],
  "roleIds": ["backend", "frontend", "mobile", "devops", "data_scientist"],
  "vectorDims": {
    "repo": 230,
    "issue": 150,
    "api": 200,
    "combined": 580
  },
  "dataset": {
    "sampleCount": 75,
    "samplesPerRole": {
      "Backend": 15,
      "Frontend": 15,
      "Mobile": 15,
      "DevOps": 15,
      "Data Scientist": 15
    }
  }
}
```

Current vector dimensions:

| Source | Dimension |
|---|---:|
| `repoVector` | 230 |
| `issueVector` | 150 |
| `apiVector` | 200 |
| `combinedVector` | 580 |

Current role labels:

| Model label | `roleId` | `roleName` |
|---|---|---|
| `Backend` | `backend` | `Backend Developer` |
| `Frontend` | `frontend` | `Frontend Developer` |
| `Mobile` | `mobile` | `Mobile Developer` |
| `DevOps` | `devops` | `DevOps Engineer` |
| `Data Scientist` | `data_scientist` | `Data Scientist` |

`skill_prototypes.json` format: an array of 25 prototype objects, 5 per role.

```json
{
  "skillName": "REST API",
  "canonicalSkillName": "REST API",
  "roleIds": ["backend"],
  "repoSkillDocument": "backend server rest api controller route endpoint request response validation",
  "issueSkillDocument": "fix api endpoint request response validation status error",
  "apiSkillTokens": ["router", "controller", "request", "response", "express"]
}
```

`skill_vectors.json` format: object keyed by `roleId`; each role has 5 skills; each skill has a 580-number `combinedVector`.

```json
{
  "backend": [
    {
      "skillName": "REST API",
      "canonicalSkillName": "REST API",
      "combinedVector": [-0.015451475977897644],
      "prototypeVersion": "dev2vec-demo-v1"
    }
  ]
}
```

The sample above truncates `combinedVector`; actual length is 580.

## 3. `infer.py` input contract

CLI:

```bash
python ml_service/infer.py --input path/to/input.json
python ml_service/infer.py --input -
```

`--input` is required. `--input -` reads JSON from stdin.

Accepted input fields:

| Field | Required by validator? | Runtime behavior |
|---|---:|---|
| `repoDocument` | No | Optional string; defaults to `""`; must be string if provided. |
| `issueDocument` | No | Optional string; defaults to `""`; must be string if provided. |
| `apiTokens` | No | Optional array of strings; defaults to `[]`; must be list of strings if provided. |
| `topN` | No | Optional integer; defaults to `3`; capped to range `1..3`. Boolean is rejected. |
| `requestId` | No | Accepted but ignored by `infer.py`; not required and not echoed. |

Exact field names:

```text
repoDocument
issueDocument
apiTokens
topN
requestId
```

Accepted input example:

```json
{
  "requestId": "analysis-123",
  "repoDocument": "backend rest api controller authentication database docker",
  "issueDocument": "fix api endpoint request response validation status error",
  "apiTokens": ["express", "postgresql", "jsonwebtoken", "docker"],
  "topN": 3
}
```

All sources may be missing/empty:

```json
{
  "repoDocument": "",
  "issueDocument": "",
  "apiTokens": [],
  "topN": 3
}
```

Missing sources produce zero vectors with the configured source dimensions.

## 4. `infer.py` output contract

Success output fields:

```text
success
modelVersion
vectorDims
vectors
rolePredictions
skillGaps
vectorSources
sourceStats
```

`rolePredictions` item fields:

```text
roleId
roleName
modelLabel
probability
rank
```

Note: user-facing requirement listed `roleId`, `roleName`, `probability`, `rank`; current code also includes `modelLabel`.

`skillGaps` format:

| Property | Current behavior |
|---|---|
| Key | `roleId`, not `roleName`. |
| `matchedSkillNames` | Array of skill names with cosine similarity `>= 0.55`. |
| `weakSkillNames` | Array of skill names with similarity `>= 0.35` and `< 0.55`. |
| `missingSkillNames` | Array of skill names with similarity `< 0.35`. |
| `recommendedNextSkills` | First 5 of `missingSkillNames + weakSkillNames`. |
| `details` | Present. Contains per-skill `skillName`, `canonicalSkillName`, `similarity`, `status`. |

Code-derived output example, with vectors shortened for readability:

```json
{
  "success": true,
  "modelVersion": "dev2vec-demo-v1",
  "vectorDims": {
    "repo": 230,
    "issue": 150,
    "api": 200,
    "combined": 580
  },
  "vectors": {
    "repoVector": [0.01],
    "issueVector": [0.02],
    "apiVector": [0.03],
    "combinedVector": [0.01, 0.02, 0.03]
  },
  "rolePredictions": [
    {
      "roleId": "backend",
      "roleName": "Backend Developer",
      "modelLabel": "Backend",
      "probability": 0.72,
      "rank": 1
    }
  ],
  "skillGaps": {
    "backend": {
      "matchedSkillNames": ["REST API"],
      "weakSkillNames": ["Database"],
      "missingSkillNames": ["Authentication"],
      "recommendedNextSkills": ["Authentication", "Database"],
      "details": [
        {
          "skillName": "REST API",
          "canonicalSkillName": "REST API",
          "similarity": 0.612345,
          "status": "matched"
        }
      ]
    }
  },
  "vectorSources": {
    "repos": true,
    "issues": true,
    "apis": true
  },
  "sourceStats": {
    "repoTextLength": 62,
    "issueTextLength": 54,
    "apiTokenCount": 4
  }
}
```

Important: actual vector arrays are not shortened in runtime output. `repoVector`, `issueVector`, `apiVector`, and `combinedVector` have lengths `230`, `150`, `200`, and `580`.

Runtime execution was not verified in this shell because neither `python` nor `py -3` is installed/on PATH:

```text
Python was not found
No installed Python found!
```

## 5. Error contract

On any exception in `infer.py`:

| Channel / value | Current behavior |
|---|---|
| stdout | Always emits one JSON document. |
| `success` | `false`. |
| `errorCode` | `DEV2VEC_INFERENCE_FAILED`. |
| `message` | Exception message truncated to 200 chars. |
| `modelVersion` | `null`. |
| stderr | One line: `Dev2Vec inference failed: <error>`. Dependency warnings may also appear. |
| exit code | `1`. |

Error JSON:

```json
{
  "success": false,
  "errorCode": "DEV2VEC_INFERENCE_FAILED",
  "message": "repoDocument must be a string",
  "modelVersion": null
}
```

BE2 recommendation:

- Always parse stdout even when the Python child process exits non-zero.
- Treat non-zero exit, invalid stdout JSON, or `success:false` as Dev2Vec unavailable/fail.
- Do not merge stderr into stdout before `JSON.parse`.
- Log stderr and `errorCode/message` separately.
- Fallback to existing hard-coded scoring until Dev2Vec response is valid.

## 6. `validate_contract.py`

Command:

```bash
python ml_service/validate_contract.py
```

It validates 3 scenarios:

| Scenario | Input | Expected |
|---|---|---|
| `contract-validation` | Backend-like `repoDocument`, empty `issueDocument`, API tokens `express/postgresql/jsonwebtoken`, `topN:3`. | `success:true`, valid modelVersion, correct vector dimensions, role count `1..3`, valid role ids, skill gap keys match predicted role ids. |
| `missing-source-validation` | Empty repo/issue/api sources, `topN:3`. | `vectorSources` all false and `combinedVector` all zeros. |
| `top-n-cap-validation` | Frontend-like repo/issue/api text, `topN:99`. | Output still has exactly 3 role predictions because topN is capped at 3. |

Expected stdout:

```text
PASS: Dev2Vec contract valid (3 scenarios)
```

Current audit note: validator could not be executed in this shell because Python is not installed/on PATH.

## 7. Current dataset

Files:

```text
ml_service/dataset/developers.seed.json
ml_service/dataset/developers.extracted.json
ml_service/dataset/dataset_summary.json
```

`developers.seed.json` exists. Seed sample format:

```json
{
  "developerId": "backend_001",
  "label": "Backend",
  "githubUsername": "davellanedam",
  "repositories": [
    "https://github.com/davellanedam/node-express-mongodb-jwt-rest-api-skeleton",
    "https://github.com/davellanedam/phalcon-micro-rest-api-skeleton"
  ]
}
```

`developers.extracted.json` exists. Extracted sample format:

```json
{
  "developerId": "backend_001",
  "label": "Backend",
  "githubUsername": "davellanedam",
  "repositories": ["https://github.com/..."],
  "repoDocument": "...",
  "issueDocument": "...",
  "apiTokens": ["express", "mongoose"],
  "sourceStats": {
    "repoCount": 2,
    "repoTextLength": 27000,
    "issueCount": 9,
    "issueTextLength": 7431,
    "apiTokenCount": 837
  }
}
```

Dataset level: developer-level. Each sample aggregates one developer's repositories into one `repoDocument`, one `issueDocument`, and one `apiTokens` list.

Role coverage:

| Role | Samples |
|---|---:|
| Backend | 15 |
| Frontend | 15 |
| Mobile | 15 |
| DevOps | 15 |
| Data Scientist | 15 |
| Total | 75 |

Extraction summary:

| Metric | Value |
|---|---:|
| `repoCountTotal` | 208 |
| `fetchSuccessRepoCount` | 202 |
| `fetchFailureRepoCount` | 6 |
| `githubRequestCount` | 6951 |
| `avgRepoTextLength` | 41292 |
| `avgIssueTextLength` | 19611 |
| `avgApiTokenCount` | 647 |
| `emptyRepoDocumentCount` | 0 |
| `emptyIssueDocumentCount` | 0 |
| `emptyApiTokensCount` | 1 |

Issue documents are extracted. API tokens are extracted. One sample has empty `apiTokens`.

## 8. Current extractor behavior

`repo_document.py`:

- Fetches `/repos/{owner}/{repo}` metadata.
- Adds name, full name, description, topics and primary language.
- Fetches topics and languages.
- Fetches README and decodes base64.
- Fetches recursive repository tree.
- Pulls config/dependency/workflow files from known paths.
- Fetches recent commits and appends commit messages.
- Fetches commit detail for up to 15 commits and appends changed file paths.
- Builds cleaned repo document with max length 50,000 chars.

`issues_document.py`:

- Fetches `/repos/{owner}/{repo}/issues?state=all`.
- Filters out pull requests.
- Adds issue title, body and labels.
- Fetches issue comments when present.
- Builds cleaned issue document with max length 30,000 chars.

`api_document.py`:

- Parses dependency/API tokens from:
  - `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
  - `composer.json`
  - `requirements.txt`, `Pipfile`, `pyproject.toml`
  - `pom.xml`, `build.gradle`, `build.gradle.kts`
  - `pubspec.yaml`
  - `Gemfile`
  - `go.mod`
  - `Cargo.toml`
  - `Dockerfile`
  - GitHub workflow YAML actions
- Returns sorted unique lowercase tokens.

`github_fetcher.py`:

- Uses GitHub API through `urllib.request`.
- Reads optional `GITHUB_TOKEN` from environment.
- Token is not strictly required, but without token GitHub rate limit is low and script warns.
- Supports `--seed`, `--output`, `--summary`, `--max-commits`, `--max-issues`, `--max-comments`, `--verify-contribution`, `--sleep`, and hidden `--limit`.

Answers to specific extractor questions:

| Question | Current answer |
|---|---|
| Need GitHub token? | Recommended, not required. Uses `GITHUB_TOKEN` if set. |
| Calls GitHub API? | Yes. |
| Parses commit messages? | Yes. |
| Parses changed files? | Yes, from commit detail. |
| Parses issue title/body/comments? | Yes. |
| Parses imports/dependencies? | Parses dependencies/config files, not arbitrary source imports. |

## 9. How to run train and infer

Install requirements:

```bash
python -m pip install -r ml_service/requirements.txt
```

Extract dataset from GitHub:

```bash
python ml_service/extractors/github_fetcher.py ^
  --seed ml_service/dataset/developers.seed.json ^
  --output ml_service/dataset/developers.extracted.json ^
  --summary ml_service/dataset/dataset_summary.json
```

Train model:

```bash
python ml_service/train.py --dataset ml_service/dataset/developers.extracted.json
```

Validate contract:

```bash
python ml_service/validate_contract.py
```

Run inference with an input file:

```bash
python ml_service/infer.py --input temp/dev2vec_input.json
```

Run inference through stdin:

```bash
printf '%s' '{"repoDocument":"","issueDocument":"","apiTokens":[],"topN":3}' | python ml_service/infer.py --input -
```

On Windows PowerShell, BE2 can write JSON to a temp file and call `--input <file>` to avoid shell quoting issues.

## 10. BE2 Integration Contract

Recommended Node.js command:

```js
execFile(pythonBin, [inferPath, "--input", inputFilePath], {
  cwd: projectRoot,
  timeout: 30000,
  maxBuffer: 10 * 1024 * 1024
});
```

Suggested values:

| Setting | Recommendation |
|---|---|
| `pythonBin` | Env-configurable. Example env: `DEV2VEC_PYTHON_BIN=python` or path to virtualenv Python. |
| `inferPath` | `ml_service/infer.py`; env override useful: `DEV2VEC_INFER_PATH`. |
| `cwd` | Project root is safest. Current `infer.py` resolves artifacts relative to its own file, so strict cwd is not required if script path is correct. |
| Timeout | Start with 30s. Increase only after measuring on deploy hardware. |
| `maxBuffer` | At least 10 MB because stdout includes 1,160 numeric vector values plus metadata. |
| Virtualenv | Recommended for BE2/deploy; required packages are not Node dependencies. |
| Status API checks | Verify required artifact files exist and `model_metadata.json.status == "ready"`. |
| Metadata path | `ml_service/artifacts/model_metadata.json`. |

Exact input schema:

```ts
type Dev2VecInput = {
  requestId?: string;
  repoDocument?: string;
  issueDocument?: string;
  apiTokens?: string[];
  topN?: number; // int, capped to 1..3
};
```

Exact success output schema:

```ts
type Dev2VecOutput = {
  success: true;
  modelVersion: string;
  vectorDims: { repo: 230; issue: 150; api: 200; combined: 580 };
  vectors: {
    repoVector: number[];
    issueVector: number[];
    apiVector: number[];
    combinedVector: number[];
  };
  rolePredictions: Array<{
    roleId: "backend" | "frontend" | "mobile" | "devops" | "data_scientist";
    roleName: string;
    modelLabel: string;
    probability: number;
    rank: number;
  }>;
  skillGaps: Record<string, {
    matchedSkillNames: string[];
    weakSkillNames: string[];
    missingSkillNames: string[];
    recommendedNextSkills: string[];
    details: Array<{
      skillName: string;
      canonicalSkillName: string;
      similarity: number;
      status: "matched" | "weak" | "missing";
    }>;
  }>;
  vectorSources: { repos: boolean; issues: boolean; apis: boolean };
  sourceStats: {
    repoTextLength: number;
    issueTextLength: number;
    apiTokenCount: number;
  };
};
```

Exact error output schema:

```ts
type Dev2VecError = {
  success: false;
  errorCode: "DEV2VEC_INFERENCE_FAILED";
  message: string;
  modelVersion: null;
};
```

Artifacts BE2 should check:

```text
ml_service/artifacts/doc2vec_repo.model
ml_service/artifacts/doc2vec_issue.model
ml_service/artifacts/doc2vec_api.model
ml_service/artifacts/role_classifier.joblib
ml_service/artifacts/label_encoder.joblib
ml_service/artifacts/skill_vectors.json
ml_service/artifacts/model_metadata.json
```

Optional/debug artifact:

```text
ml_service/artifacts/skill_prototypes.json
```

Recommended BE2 env variables:

```text
DEV2VEC_ENABLED=true
DEV2VEC_PYTHON_BIN=python
DEV2VEC_INFER_PATH=ml_service/infer.py
DEV2VEC_TIMEOUT_MS=30000
DEV2VEC_MAX_BUFFER_BYTES=10485760
DEV2VEC_ARTIFACTS_DIR=ml_service/artifacts
```

## 11. Differences from agreed design

| Design point | Current status | BE2 impact | Owner to fix |
|---|---|---|---|
| 5 roles: `backend`, `frontend`, `mobile`, `devops`, `data_scientist` | Matches. Internal model labels are title-case, output roleIds match design. | BE2 should key by `roleId`. | None. |
| `repoVector` 230 | Matches. | None. | None. |
| `issueVector` 150 | Matches. | None. | None. |
| `apiVector` 200 | Matches. | None. | None. |
| `combinedVector` 580 | Matches. Concatenation order is repo + issue + api. | BE2 can trust vector length and order. | None. |
| Top 3 roles | Matches by default and caps `topN` to max 3. | BE2 should not expect more than 3 predictions. | None. |
| Missing source uses zero vector | Matches. Validator checks all-empty case. | BE2 may pass empty fields safely. | None. |
| Skill gap by skill prototype vector | Matches. Uses `skill_vectors.json` cosine similarity against combined vector. | BE2 should consume skill gap arrays/details by `roleId`. | None. |
| Train local/offline, production inference only | Matches README and code separation. | BE2 should call only `infer.py`, not `train.py` or crawler. | None. |
| Input fields required | Current code makes `repoDocument`, `issueDocument`, `apiTokens` optional through defaults, although README describes them as normal input fields. | BE2 can send all fields explicitly for clarity. No breakage. | BE2 convention, no BE1 fix required unless stricter validation is desired. |
| Error object field name | Current error uses `message`, not `error`. | BE2 should read `message` and `errorCode`; do not expect `error`. | BE2, or BE1 if a shared contract requires `error`. |
| Runtime availability | Code/artifacts exist, but local shell has no Python executable on PATH. | BE2/deploy must provision Python/venv and dependencies before integration. | Deployment/BE2 environment. |

## Audit conclusion

BE1 currently provides a usable Dev2Vec ML service contract in `ml_service`: dataset extraction, local training, artifacts, inference, skill gaps and contract validation are present. The implementation aligns with the agreed vector dimensions, 5-role design, top-3 prediction cap, zero-vector fallback, and prototype-vector skill gap approach.

The main integration risk for BE2 is operational rather than schema-level: the Node.js runtime must call a Python executable with the required packages installed, parse stdout even on non-zero exit, and keep stderr separate from JSON parsing.
