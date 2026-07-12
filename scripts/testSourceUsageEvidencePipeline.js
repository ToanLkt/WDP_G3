const assert = require('assert');

const {
  parseSourceUsageEvidence,
} = require('../src/services/dev2vec/sourceUsageParser.service');
const {
  buildDev2VecInputFromRepositoryAnalysis,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const {
  normalizeDev2VecInput,
} = require('../src/services/dev2vec/dev2vec.service');

const file = (path, sourceContent) => ({
  path,
  fileName: path.split('/').pop(),
  sourceContent,
});

const frontend = file('src/components/UserList.tsx', `
import React, { useEffect, useState } from "react";
import axios from "axios";
export function UserList() {
  const [users, setUsers] = useState([]);
  useEffect(() => { axios.get("/api/users").then((res) => setUsers(res.data)); }, []);
  return null;
}
`);

const backend = file('src/routes/user.routes.ts', `
import express from "express";
import mongoose from "mongoose";
const router = express.Router();
router.get("/users", handler);
mongoose.connect(process.env.MONGO_URI);
`);

const mobile = file('src/screens/MapScreen.tsx', `
import * as Location from "expo-location";
Location.getCurrentPositionAsync();
`);

const data = file('training/model.py', `
import pandas as pd
from sklearn.model_selection import train_test_split
df = pd.read_csv("data.csv")
model.fit(df)
model.predict(df)
`);

const devopsDocker = file('Dockerfile', `
FROM node:20
RUN docker build .
`);
const devopsWorkflow = file('.github/workflows/deploy.yml', `
jobs:
  deploy:
    steps:
      - uses: actions/checkout@v4
      - run: kubectl apply -f k8s/deployment.yml
`);
const devopsTerraform = file('terraform/main.tf', `
resource "aws_instance" "web" {}
`);

const ambiguous = file('src/services/api.ts', `
import axios from "axios";
export const getUsers = () => axios.get("/api/users");
`);

const invalid = file('src/components/Broken.tsx', `
import React from "react";
function Broken( {
`);

const minified = file('dist/app.min.js', `import axios from "axios";${'a'.repeat(1200)}`);
const duplicate = file('src/components/Duplicate.tsx', `
import axios from "axios";
axios.get("/one");
axios.get("/two");
axios.get("/three");
`);

const usage = parseSourceUsageEvidence([
  frontend,
  backend,
  mobile,
  data,
  devopsDocker,
  devopsWorkflow,
  devopsTerraform,
  ambiguous,
  invalid,
  minified,
  duplicate,
], {
  limits: {
    maxTokensTotal: 120,
    maxTokensPerFile: 20,
  },
});

const has = (token) => usage.tokens.includes(token);

assert(has('import:react'));
assert(has('import:axios'));
assert(has('frontend_hook:usestate'));
assert(has('frontend_hook:useeffect'));
assert(has('client_http:axios.get'));
assert(!usage.tokens.includes('server_route:express.get') || has('import:express'));

assert(has('import:express'));
assert(has('import:mongoose'));
assert(has('server_route:express.get'));
assert(has('database:mongoose.connect'));

assert(has('import:expo-location'));
assert(has('mobile_location:getcurrentpositionasync'));

assert(has('import:pandas'));
assert(has('import:sklearn.model_selection'));
assert(has('data_io:pandas.read_csv'));
assert(has('ml_train:model.fit'));
assert(has('ml_infer:model.predict'));
assert(!usage.tokens.includes('data.csv'));

assert(has('devops_docker:build'));
assert(has('devops_kubernetes:apply'));
assert(has('devops_github_action:actions/checkout'));
assert(has('devops_terraform_resource:aws_instance'));

const ambiguousFile = usage.files.find((item) => item.path === 'src/services/api.ts');
assert(ambiguousFile.tokens.includes('client_http:axios.get'));
assert(!ambiguousFile.tokens.some((item) => item.startsWith('server_route:')));

assert(usage.files.some((item) => item.path === 'src/components/Broken.tsx'));
assert(!usage.files.some((item) => item.path === 'dist/app.min.js'));
assert.strictEqual(usage.tokens.filter((item) => item === 'client_http:axios.get').length, 1);

const input = buildDev2VecInputFromRepositoryAnalysis({
  repository: {
    name: 'usage-fixture',
    fullName: 'example/usage-fixture',
    language: 'TypeScript',
  },
  packages: [{
    packageFiles: ['package.json'],
    packages: ['react', 'express'],
    frameworks: ['React', 'Backend HTTP framework'],
    detectedFiles: [frontend, backend, mobile, data, devopsWorkflow, ambiguous],
  }],
  commits: [],
  issues: [],
  requestId: 'source-usage-fixture',
});

assert(input.apiTokens.includes('react'));
assert(input.apiTokens.includes('express'));
assert(input.apiTokens.includes('import:react'));
assert(input.apiTokens.includes('import:axios'));
assert(input.apiTokens.includes('server_route:express.get'));
assert(input.apiTokens.includes('client_http:axios.get'));
assert(input.apiTokens.includes('mobile_location:getcurrentpositionasync'));
assert(input.apiTokens.includes('data_io:pandas.read_csv'));
assert(input.apiTokens.includes('devops_kubernetes:apply'));

const payload = normalizeDev2VecInput(input);
assert(Array.isArray(payload.apiTokens));
assert.strictEqual(typeof payload.repoDocument, 'string');
assert.strictEqual(typeof payload.issueDocument, 'string');
assert.strictEqual(payload.apiTokens.includes('client_http:axios.get'), true);

console.log('PASS: Source usage evidence pipeline fixtures');
