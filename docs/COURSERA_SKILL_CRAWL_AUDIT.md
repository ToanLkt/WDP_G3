# Coursera Skill Crawl Audit

Generated deterministically from the repository at audit date 2026-07-23. This audit did not access Coursera or any network service.

## 1. Executive Summary

- Skill definitions found across current and legacy canonical catalogs: **94** (25 Dev2Vec + 69 legacy entries).
- Current canonical crawl inventory: **25**.
- Active normalized aliases: **133**.
- Priority split: **P0 11 / P1 10 / P2 4**.
- Excluded legacy/duplicate entries: **69**.
- Manual-review blockers: **0**. Broad/ambiguous names are retained only with contextual queries.

## 2. Skill Sources

| Source | File/function | Active | Notes |
| --- | --- | ---: | --- |
| Python prototypes | `ml_service/artifacts/skill_prototypes.json`; `evaluate_skill_gaps.py` | Yes | 25 authoritative names; emitted as matched/weak/missing/recommended. |
| Node Dev2Vec catalog | `src/constants/dev2vecCatalog.js` | Yes | Runtime mirror used by role and skill catalog APIs. |
| Roadmap gap | `roadmapSkillGap.service.js#buildDev2VecSkillGapContext` | Yes | Consumes the selected source analysis and Python gap. |
| Roadmap enforcement | `roadmap.service.js#enforceMainRoadmapDev2VecSkills` | Yes | Rewrites every main-path task to the authoritative gap allow-list. |
| Learning canonicalizer | `canonicalSkills.js`; `skillCanonicalizer.js` | Yes | Dev2Vec entries are ordered first; unknown text passes through unchanged. |
| Learning/YouTube | `roadmapLearning.service.js`; `learning.service.js#searchAndCacheYoutubeResources` | Yes | Queries and persists by canonical skill, role, level and language. |
| Legacy role vectors | `src/constants/roleSkillVectors.js` | No for v12 roadmap authority | Active role-matching compatibility/catalog code, but cannot override Python v4 gaps. |
| Repository packages/chat | `RepositoryPackage`; roadmap/chat context builders | No | Examples/technical context only; explicitly forbidden as personal skill evidence. |

## 3. Source-of-truth Decision

The authoritative taxonomy is the 25 prototypes in `ml_service/artifacts/skill_prototypes.json`, mirrored exactly by `DEV2VEC_SKILLS`. Python assigns their statuses and recommendations. A roadmap is bound to one compatible v12 source analysis and `enforceMainRoadmapDev2VecSkills` restricts main-path tasks to that analysis's gap names. The 69-entry `LEGACY_CANONICAL_SKILLS` list supports older role/vector and learning inputs but is not allowed to expand this crawl.

The canonicalizer lowercases, trims, converts hyphens/dashes to spaces and collapses whitespace. It does not remove punctuation, strip versions, or reject unknown skills. Lookup is first-match-wins, so Dev2Vec aliases shadow later legacy entries. No current prototype is versioned.

## 4. Canonical Skill Inventory

| Skill | Roles | Python gap | Roadmap | Learning | Priority | Crawl status |
| --- | --- | ---: | ---: | ---: | --- | --- |
| API Integration | mobile | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| API Testing | backend | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| App State Management | mobile | Yes | Yes | Yes | P2 | CRAWL_OPTIONAL |
| Authentication | backend | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| CI/CD | devops | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| Component Design | frontend | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| Data Analysis | data_scientist | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| Data Visualization | data_scientist | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| Database | backend | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| Docker | devops | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| Docker Basics | backend | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| Frontend Testing | frontend | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| Infrastructure as Code | devops | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| Kubernetes | devops | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| Local Storage | mobile | Yes | Yes | Yes | P2 | CRAWL_OPTIONAL |
| Machine Learning | data_scientist | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| Mobile UI | mobile | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| Model Training | data_scientist | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| Monitoring | devops | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| Navigation | mobile | Yes | Yes | Yes | P2 | CRAWL_OPTIONAL |
| NLP Basics | data_scientist | Yes | Yes | Yes | P2 | CRAWL_OPTIONAL |
| React UI | frontend | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| Responsive Design | frontend | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |
| REST API | backend | Yes | Yes | Yes | P0 | CRAWL_REQUIRED |
| State Management | frontend | Yes | Yes | Yes | P1 | CRAWL_REQUIRED |

## 5. Alias Mapping

Aliases are normalization inputs only and are never separate crawl jobs. There are 133 unique normalized active aliases.

| Alias | Canonical |
| --- | --- |
| .github/workflows | CI/CD |
| alerting | Monitoring |
| ansible | Infrastructure as Code |
| api | REST API |
| api client | API Integration |
| app state | App State Management |
| application state | State Management |
| asyncstorage | Local Storage |
| auth | Authentication |
| authorization | Authentication |
| axios | API Integration |
| breakpoint | Responsive Design |
| charts | Data Visualization |
| ci cd | CI/CD |
| cicd | CI/CD |
| cluster | Kubernetes |
| component architecture | Component Design |
| component testing | Frontend Testing |
| components | Component Design |
| container | Docker Basics |
| containerization | Docker Basics |
| context api | State Management |
| continuous deployment | CI/CD |
| continuous integration | CI/CD |
| controller | REST API |
| css grid | Responsive Design |
| dashboard | Data Visualization |
| data cleaning | Data Analysis |
| data modeling | Database |
| database design | Database |
| deep link | Navigation |
| deployment | Kubernetes |
| docker basics | Docker Basics |
| docker compose | Docker Basics |
| docker container | Docker |
| docker image | Docker |
| dockerfile | Docker Basics |
| eda | Data Analysis |
| endpoint | REST API |
| endpoint testing | API Testing |
| exploratory data analysis | Data Analysis |
| express | REST API |
| express.js | REST API |
| feature engineering | Model Training |
| fetch api | API Integration |
| flexbox | Responsive Design |
| frontend ui | React UI |
| frontend unit testing | Frontend Testing |
| github actions | CI/CD |
| github workflow | CI/CD |
| global state | State Management |
| grafana | Monitoring |
| hyperparameter tuning | Model Training |
| iac | Infrastructure as Code |
| index | Database |
| infrastructure code | Infrastructure as Code |
| integration testing | API Testing |
| jest | API Testing |
| jsx | React UI |
| jwt | Authentication |
| jwt authentication | Authentication |
| k8s | Kubernetes |
| kube | Kubernetes |
| lifecycle state | App State Management |
| logging | Monitoring |
| login | Authentication |
| matplotlib | Data Visualization |
| metrics | Monitoring |
| ml | Machine Learning |
| mobile api integration | API Integration |
| mobile cache | Local Storage |
| mobile first design | Responsive Design |
| mobile layout | Mobile UI |
| mobile navigation | Navigation |
| mobile screen | Mobile UI |
| mobile state management | App State Management |
| model evaluation | Model Training |
| mongodb | Database |
| mongoose | Database |
| mysql | Database |
| network request | API Integration |
| nlp | NLP Basics |
| node.js | REST API |
| numpy | Data Analysis |
| observability | Monitoring |
| offline storage | Local Storage |
| openapi | REST API |
| pandas | Data Analysis |
| permission | Authentication |
| pod | Kubernetes |
| postgresql | Database |
| preferences | Local Storage |
| prometheus | Monitoring |
| query | Database |
| rbac | Authentication |
| react | React UI |
| react components | Component Design |
| react native ui | Mobile UI |
| react navigation | Navigation |
| react testing | Frontend Testing |
| react.js | React UI |
| reactive state | App State Management |
| reactjs | React UI |
| redux | State Management |
| refresh token | Authentication |
| responsive web design | Responsive Design |
| rest | REST API |
| rest api testing | API Testing |
| restful api | REST API |
| route | REST API |
| rwd | Responsive Design |
| schema design | Database |
| scikit learn | Machine Learning |
| seaborn | Data Visualization |
| sql | Database |
| stack navigation | Navigation |
| store | State Management |
| supertest | API Testing |
| supervised learning | Machine Learning |
| swagger | REST API |
| tab navigation | Navigation |
| terraform | Infrastructure as Code |
| testing | API Testing |
| text classification | NLP Basics |
| text processing | NLP Basics |
| tokenization | NLP Basics |
| training pipeline | Model Training |
| ui component | Component Design |
| ui testing | Frontend Testing |
| unit testing | API Testing |
| unsupervised learning | Machine Learning |
| visualization | Data Visualization |
| widget | Mobile UI |

## 6. Skills to Crawl

### P0

API Testing, Authentication, CI/CD, Data Analysis, Database, Docker, Docker Basics, Kubernetes, Machine Learning, React UI, REST API

### P1

API Integration, Component Design, Data Visualization, Frontend Testing, Infrastructure as Code, Mobile UI, Model Training, Monitoring, Responsive Design, State Management

### P2

App State Management, Local Storage, Navigation, NLP Basics

## 7. Skills Not to Crawl

All 69 legacy catalog entries are listed machine-readably in the JSON. Eight are duplicate names shadowed by Dev2Vec entries; the remainder cannot appear in the current Python gap. Test fixtures such as Accessibility, Documentation, Clean Code and Project Setup do not enter the official list unless a current Python prototype is added in a future model generation.

RepositoryPackage dependencies, README technologies, teammate contributions, chat technical context and test-only strings are explicitly excluded.

## 8. Broad/Ambiguous Skills

- Database uses “database fundamentals SQL and NoSQL”, not the raw broad word.
- Navigation, Local Storage and App State Management are qualified with mobile-app context.
- Monitoring is qualified with software observability; Component Design with frontend UI.
- NLP Basics expands NLP to natural language processing to avoid neuro-linguistic-programming noise.
- Docker Basics and Docker remain separate because the backend currently models them as separate role-specific prototypes; they may deduplicate the same returned URL at persistence time.

## 9. Coursera Search Query Plan

| Skill | Primary query | Alternatives | Negative terms |
| --- | --- | --- | --- |
| API Integration | mobile application API integration | REST API client development; HTTP API integration for apps | systems integration overview only |
| API Testing | REST API testing | automated API testing; integration testing web APIs | manual testing only |
| App State Management | mobile app state management | React Native state management; Flutter application state management | government state management |
| Authentication | web authentication and authorization | JWT OAuth authentication; application identity and access control | biometric hardware |
| CI/CD | continuous integration and continuous delivery | CI/CD pipelines; DevOps build test deploy automation | marketing pipeline |
| Component Design | frontend UI component design | reusable React components; web design systems components | electronic components |
| Data Analysis | data analysis with Python | exploratory data analysis; data analysis with Pandas | business overview only |
| Data Visualization | data visualization with Python | Matplotlib and Seaborn data visualization; visual analytics | architectural visualization |
| Database | database fundamentals SQL and NoSQL | database design and management; relational and NoSQL databases | biological database |
| Docker | Docker containerization | Docker containers; Docker development workflows | Kubernetes only; certification exam only |
| Docker Basics | Docker containers for beginners | Docker fundamentals; containerization with Docker | Kubernetes only |
| Frontend Testing | frontend web application testing | React component testing; JavaScript UI testing | backend testing only |
| Infrastructure as Code | infrastructure as code with Terraform | IaC fundamentals; Terraform and Ansible automation | building architecture |
| Kubernetes | Kubernetes container orchestration | Kubernetes fundamentals; Kubernetes application deployment | Docker only |
| Local Storage | mobile app local data storage | offline mobile data persistence; SQLite mobile storage | warehouse storage; cloud storage administration |
| Machine Learning | machine learning | applied machine learning with Python; supervised and unsupervised learning | hardware machine maintenance |
| Mobile UI | mobile application UI design and development | mobile interface development; mobile app user experience | mobile hardware repair |
| Model Training | machine learning model training and evaluation | feature engineering and model validation; hyperparameter tuning machine learning | fitness training; fashion model |
| Monitoring | software observability and monitoring | application monitoring with Prometheus and Grafana; DevOps metrics logs and alerts | health monitoring; environmental monitoring |
| Navigation | mobile app navigation | React Native navigation; mobile navigation architecture | GPS navigation; maritime navigation |
| NLP Basics | natural language processing fundamentals | NLP with Python; text processing and classification | neuro linguistic programming |
| React UI | React JavaScript user interfaces | React component development; React web development | React Native only |
| Responsive Design | responsive web design | mobile-first web design; CSS responsive layouts | responsive leadership |
| REST API | REST API design and development | RESTful API development; Web API design | restaurant; real estate |
| State Management | frontend state management | React Redux state management; application state architecture | government state management |

## 10. Existing YouTube Alignment

The learning flow canonicalizes `skillName`, builds a query from canonical skill + task title + role + level, then keys persisted resources by canonical skill, target role, level, language and type. Coursera can reuse the canonicalization and relevance concepts, but should use the curated contextual primary queries in this plan rather than the raw YouTube default for broad names. YouTube has no durable historical “all queried skills” inventory in code; database rows would be required for that operational count.

## 11. Role Coverage Matrix

| Role | Required crawl skills |
| --- | --- |
| Backend Developer | REST API, Database, Authentication, Docker Basics, API Testing |
| Frontend Developer | React UI, Component Design, State Management, Frontend Testing, Responsive Design |
| Mobile Developer | Mobile UI, Navigation, Local Storage, API Integration, App State Management |
| DevOps Engineer | Docker, Kubernetes, CI/CD, Infrastructure as Code, Monitoring |
| Data Scientist | Data Analysis, Machine Learning, Model Training, Data Visualization, NLP Basics |

## 12. Roadmap Coverage

**100% (25/25)** of the current Dev2Vec prototype/role catalog has a classified Coursera plan. Main-path roadmap coverage is therefore 100% for any valid current Python gap. Supporting/legacy paths are outside this guarantee and intentionally excluded.

## 13. Recommended Crawl Limits

- P0: up to 8 direct courses/skill (within requested 5–10).
- P1: up to 5 direct courses/skill (within requested 3–5).
- P2: up to 3 direct courses/skill (within requested 1–3).
- Accept course, specialization and guided project; persist only verified direct course URLs and deduplicate URL + canonical skill.

## 14. Risks

- The Python artifact and Node mirror can drift; the local audit script fails if they do.
- Unknown text currently passes through canonicalization, but main-path enforcement contains it when a gap allow-list exists.
- Supporting paths and historical roadmaps may contain legacy/out-of-catalog skills and have no 25-skill coverage guarantee.
- Broad queries can return unrelated domains; contextual queries and negative terms are mandatory.
- Coursera URLs and availability can become stale; crawler/persistence must revalidate independently.
- Docker Basics and Docker overlap semantically but cannot be merged without changing the model/contract.

## 15. Final Crawl Recommendation

Use exactly the 25 entries in `data/coursera-skill-crawl-plan.json`. Crawl P0 first, then P1, then P2. Do not derive jobs from whole-repository packages, legacy role vectors, README/chat context, tests, or arbitrary LLM output. No production API, model artifact, FE contract, roadmap logic or learning logic was changed by this audit.
