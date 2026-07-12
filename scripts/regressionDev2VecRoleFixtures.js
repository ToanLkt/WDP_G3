const assert = require('assert');
const { execFileSync } = require('child_process');

const {
  buildDev2VecInputFromRepositoryAnalysis,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const {
  runDev2VecInference,
} = require('../src/services/dev2vec/dev2vec.service');

const file = (path, sourceContent) => ({
  path,
  fileName: path.split('/').pop(),
  sourceContent,
});

const commonIssue = (labels, body = 'Implement and verify user-facing behavior without leaking private data.') => [{
  number: 1,
  title: `${labels.join(' ')} implementation task`,
  body,
  labels,
  state: 'open',
  repositoryFullName: 'fixture/repo',
}];

const fixtures = [
  {
    name: 'frontend',
    expectedRoleHint: 'frontend',
    packages: ['react', 'react-dom', 'react-router-dom', 'vite', 'tailwindcss', 'axios'],
    frameworks: ['React', 'Frontend routing', 'Vite', 'Frontend styling'],
    language: 'TypeScript',
    files: [
      file('src/components/UserCard.tsx', 'import React, { useEffect, useState } from "react"; import axios from "axios"; export function UserCard(){ const [user,setUser]=useState(null); useEffect(()=>{ axios.get("/api/users/me").then(r=>setUser(r.data)); },[]); return <div className="p-4">{user?.name}</div>; }'),
      file('src/pages/Dashboard.tsx', 'import { Link, useNavigate } from "react-router-dom"; export const Dashboard = () => <Link to="/settings">Settings</Link>;'),
      file('src/hooks/useUsers.ts', 'import { useEffect, useState } from "react"; export function useUsers(){ const [users,setUsers]=useState([]); useEffect(()=>{},[]); return users; }'),
      file('src/services/api.ts', 'import axios from "axios"; export const getUsers = () => axios.get("/api/users");'),
      file('tailwind.config.js', 'module.exports = { content: ["./src/**/*.{ts,tsx}"], theme: { extend: {} } };'),
    ],
    issues: commonIssue(['frontend', 'ui'], 'React page state and API loading task.'),
    assertions(input) {
      assert(input.apiTokens.includes('client_http:axios.get'));
      assert(input.apiTokens.includes('frontend_hook:usestate'));
      assert(!input.apiTokens.some((token) => token.startsWith('server_route:')));
      assert(!input.apiTokens.some((token) => token.startsWith('database:')));
      assert(input.sourceStats.frontendFileCount > 0);
    },
  },
  {
    name: 'mobile',
    expectedRoleHint: 'mobile',
    packages: ['react-native', 'expo', '@react-navigation/native', 'axios', 'expo-location'],
    frameworks: ['React Native', 'Expo', 'Mobile navigation'],
    language: 'TypeScript',
    files: [
      file('src/screens/HomeScreen.tsx', 'import React from "react"; import axios from "axios"; export const HomeScreen = () => { axios.get("/api/feed"); return null; };'),
      file('src/navigation/AppNavigator.tsx', 'import { NavigationContainer } from "@react-navigation/native"; export function AppNavigator(){ return <NavigationContainer />; }'),
      file('src/screens/MapScreen.tsx', 'import * as Location from "expo-location"; export async function locate(){ return Location.getCurrentPositionAsync(); }'),
      file('app.json', '{ "expo": { "name": "Mobile Fixture", "ios": {}, "android": {} } }'),
      file('eas.json', '{ "build": { "production": {} } }'),
      file('android/app/build.gradle', 'android { defaultConfig { applicationId "com.fixture" } }'),
      file('ios/AppDelegate.swift', 'import UIKit'),
    ],
    issues: commonIssue(['mobile', 'expo'], 'Expo location and navigation screen bug.'),
    assertions(input) {
      assert(input.apiTokens.includes('mobile_location:getcurrentpositionasync'));
      assert(input.apiTokens.includes('client_http:axios.get'));
      assert(input.sourceStats.mobileFileCount > 0);
      assert(!input.apiTokens.some((token) => token.startsWith('server_route:')));
    },
  },
  {
    name: 'backend',
    expectedRoleHint: 'backend',
    packages: ['express', 'mongoose', 'jsonwebtoken', 'bcrypt', 'cors'],
    frameworks: ['Backend HTTP framework', 'Database', 'Authentication'],
    language: 'JavaScript',
    files: [
      file('src/routes/user.routes.js', 'import express from "express"; const router = express.Router(); router.get("/users", listUsers); router.post("/users", createUser); export default router;'),
      file('src/controllers/user.controller.js', 'export async function listUsers(req, res) { return res.json([]); }'),
      file('src/models/User.js', 'import mongoose from "mongoose"; const UserSchema = new mongoose.Schema({ email: String }); mongoose.connect(process.env.MONGO_URI);'),
      file('src/middleware/auth.js', 'import jwt from "jsonwebtoken"; export function auth(req,res,next){ jwt.verify(req.headers.authorization, process.env.JWT_SECRET); next(); }'),
    ],
    issues: commonIssue(['backend', 'auth'], 'JWT auth middleware and MongoDB route task.'),
    assertions(input) {
      assert(input.apiTokens.includes('server_route:express.get'));
      assert(input.apiTokens.includes('database:mongoose.connect'));
      assert(input.sourceStats.backendFileCount > 0);
      assert(input.sourceStats.databaseFileCount > 0);
      assert(input.sourceStats.authFileCount > 0);
    },
  },
  {
    name: 'devops',
    expectedRoleHint: 'devops',
    packages: ['docker', 'kubectl', 'terraform'],
    frameworks: ['Docker', 'Kubernetes', 'Terraform', 'GitHub Actions'],
    language: 'HCL',
    files: [
      file('Dockerfile', 'FROM node:20\nWORKDIR /app\nCOPY package.json .\nRUN npm ci\nCMD ["node","server.js"]'),
      file('docker-compose.yml', 'services:\n  api:\n    build: .\n  db:\n    image: postgres:16'),
      file('.github/workflows/deploy.yml', 'jobs:\n  deploy:\n    steps:\n      - uses: actions/checkout@v4\n      - run: docker build .\n      - run: kubectl apply -f k8s/deployment.yml'),
      file('terraform/main.tf', 'resource "aws_instance" "web" { ami = "ami-123" instance_type = "t3.micro" }'),
      file('k8s/deployment.yml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api'),
      file('scripts/deploy.sh', 'docker build -t fixture .\nkubectl apply -f k8s/deployment.yml'),
    ],
    issues: commonIssue(['devops', 'deployment'], 'CI deployment and Kubernetes infrastructure task.'),
    assertions(input) {
      assert(input.apiTokens.includes('devops_docker:build'));
      assert(input.apiTokens.includes('devops_kubernetes:apply'));
      assert(input.apiTokens.includes('devops_terraform_resource:aws_instance'));
      assert(input.sourceStats.devopsFileCount > 0);
      assert(input.sourceStats.devopsCiFileCount > 0);
    },
  },
  {
    name: 'data_scientist',
    expectedRoleHint: 'data',
    packages: ['pandas', 'scikit-learn', 'torch', 'numpy', 'jupyter'],
    frameworks: ['Pandas', 'Scikit-learn', 'PyTorch', 'Machine Learning'],
    language: 'Python',
    files: [
      file('notebooks/training.ipynb', '{"cells":[{"source":["import pandas as pd\\n","from sklearn.model_selection import train_test_split\\n"]}]}'),
      file('src/train.py', 'import pandas as pd\nfrom sklearn.ensemble import RandomForestClassifier\ndf = pd.read_csv("data/train.csv")\nmodel = RandomForestClassifier()\nmodel.fit(df.drop("target", axis=1), df["target"])'),
      file('src/infer.py', 'import torch\nprediction = model.predict(features)\n'),
      file('data/schema.md', '# Dataset\nFeature columns and labels.'),
    ],
    issues: commonIssue(['ml', 'data'], 'Training pipeline with pandas preprocessing and model fit.'),
    assertions(input) {
      assert(input.apiTokens.includes('data_io:pandas.read_csv'));
      assert(input.apiTokens.includes('ml_train:model.fit'));
      assert(input.apiTokens.includes('ml_infer:model.predict'));
      assert(input.sourceStats.dataFileCount > 0);
      assert(input.sourceStats.categoryCounts.data_ml_training > 0);
    },
  },
  {
    name: 'mixed_fullstack',
    expectedRoleHint: null,
    packages: ['react', 'vite', 'express', 'mongoose', 'docker'],
    frameworks: ['React', 'Vite', 'Backend HTTP framework', 'Database', 'Docker'],
    language: 'TypeScript',
    files: [
      file('frontend/src/App.tsx', 'import React, { useState } from "react"; import axios from "axios"; export function App(){ const [items,setItems]=useState([]); axios.get("/api/items").then(r=>setItems(r.data)); return null; }'),
      file('backend/src/routes/items.ts', 'import express from "express"; import mongoose from "mongoose"; const router = express.Router(); router.get("/items", handler); mongoose.connect(process.env.MONGO_URI);'),
      file('Dockerfile', 'FROM node:20\nRUN npm ci'),
    ],
    issues: commonIssue(['fullstack'], 'React frontend, Express backend and Docker packaging task.'),
    assertions(input) {
      assert(input.sourceStats.frontendFileCount > 0);
      assert(input.sourceStats.backendFileCount > 0);
      assert(input.sourceStats.dockerFileCount > 0);
      assert(input.apiTokens.includes('client_http:axios.get'));
      assert(input.apiTokens.includes('server_route:express.get'));
    },
  },
];

const summarizeSkillGaps = (skillGaps = {}) => Object.fromEntries(
  Object.entries(skillGaps).slice(0, 5).map(([role, gap]) => [
    role,
    {
      matched: (gap.matchedSkills || []).slice(0, 3).map((skill) => ({
        skill: skill.skill || skill.name,
        similarity: skill.similarity,
      })),
      weak: (gap.weakSkills || []).slice(0, 3).map((skill) => skill.skill || skill.name),
      missing: (gap.missingSkills || []).slice(0, 3).map((skill) => skill.skill || skill.name),
    },
  ])
);

const buildInput = (fixture) => buildDev2VecInputFromRepositoryAnalysis({
  repository: {
    name: `${fixture.name}-fixture`,
    fullName: `fixture/${fixture.name}`,
    description: `${fixture.name} regression fixture`,
    language: fixture.language,
  },
  packages: [{
    packageFiles: ['package.json'],
    packages: fixture.packages,
    dependencies: Object.fromEntries(fixture.packages.map((pkg) => [pkg, '^1.0.0'])),
    frameworks: fixture.frameworks,
    detectedFiles: fixture.files,
    languages: [fixture.language],
  }],
  commits: [{
    sha: `${fixture.name}-sha`,
    message: `feat: add ${fixture.name} fixture`,
    changedFiles: fixture.files.map((item) => item.path),
  }],
  issues: fixture.issues,
  channelStatus: { issue: 'available' },
  topN: 3,
  requestId: `regression-${fixture.name}`,
});

const auditOov = (tokenMap) => {
  const stdout = execFileSync(
    process.env.DEV2VEC_PYTHON_BIN || 'python',
    ['ml_service/audit_api_token_oov.py'],
    {
      input: JSON.stringify(tokenMap),
      encoding: 'utf8',
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    }
  );
  return JSON.parse(stdout);
};

(async () => {
  const results = [];
  const tokensByFixture = {};

  for (const fixture of fixtures) {
    const input = buildInput(fixture);
    fixture.assertions(input);
    assert.strictEqual(input.evidenceChannels.availableChannels.repo, true, fixture.name);
    assert.strictEqual(input.evidenceChannels.availableChannels.issue, true, fixture.name);
    assert.strictEqual(input.evidenceChannels.availableChannels.api, true, fixture.name);

    const output = await runDev2VecInference(input);
    assert.strictEqual(output.vectorDims.repo, 230, fixture.name);
    assert.strictEqual(output.vectorDims.issue, 150, fixture.name);
    assert.strictEqual(output.vectorDims.api, 200, fixture.name);
    assert.strictEqual(output.vectorDims.combined, 580, fixture.name);
    assert(output.vectors.combinedVector.every((value) => Number.isFinite(Number(value))), fixture.name);
    assert(output.rolePredictions.length > 0, fixture.name);
    for (let index = 1; index < output.rolePredictions.length; index += 1) {
      assert(
        Number(output.rolePredictions[index - 1].probability || 0) >= Number(output.rolePredictions[index].probability || 0),
        `${fixture.name} probabilities must be sorted`
      );
    }

    tokensByFixture[fixture.name] = input.apiTokens;
    results.push({
      fixture: fixture.name,
      sourceStats: input.sourceStats,
      evidenceCategories: Object.keys(input.sourceStats.categoryCounts || {}),
      roleHints: [...new Set(input.evidencePreview.sourceFiles.flatMap((fileItem) => fileItem.roleHints || []))],
      issueStatus: input.evidenceChannels.channelStatus.issue,
      availableChannels: input.evidenceChannels.availableChannels,
      apiTokens: input.apiTokens,
      repoDocumentSummary: input.repoDocument.slice(0, 260),
      probabilities: output.rolePredictions.map((role) => ({
        roleId: role.roleId,
        roleName: role.roleName,
        probability: role.probability,
      })),
      probabilityNote: 'Production Node service clamps topN to max 3, so this is returned top-N probability mass, not all 5 classes.',
      topRole: output.rolePredictions[0],
      skillSimilarities: summarizeSkillGaps(output.skillGaps),
    });
  }

  const oov = auditOov(tokensByFixture);

  console.log(JSON.stringify({
    fixtures: results,
    oovCoverage: oov,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
