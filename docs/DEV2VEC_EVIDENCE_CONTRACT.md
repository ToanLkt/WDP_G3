# Dev2Vec Evidence Contract

Repository and API channels require `contributionSummary.accepted === true`, with at least five verified changed lines. Repository text contains gated project context, selected user commit messages, selected authored PR title/body and retained paths. Whole-repository source, teammate contributions and previous model output are excluded.

Issue evidence is independent and contains only authored, assigned or commented issues plus at most three comments by the linked user. API tokens come only from selected user-touched manifests/config/source versions. Dependencies are direct evidence; imports must occur in at least five touched files. Tokens are lowercase, canonicalized, unique and sorted.

Canonical availability is derived from final content. Limits are 15 commits, five PRs, 20 paths per contribution, 20 issues, 30,000 issue characters, 50,000 repository characters, ten fetched touched files and topN 1–3. Full details and parity evidence are in [Phase 5](DEV2VEC_PHASE5_TRAINING_PARITY_FULL_REGRESSION.md).

Dev2Vec role prediction is a model-based recommendation; probability is not absolute certainty. Skill-gap output is beta/recommendation evidence, not proof that a developer lacks a skill.
