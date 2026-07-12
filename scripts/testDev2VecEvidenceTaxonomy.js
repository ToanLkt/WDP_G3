const assert = require('assert');

const {
  buildDev2VecInputFromRepositoryAnalysis,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');

const file = (path, sourceContent) => ({
  path,
  fileName: path.split('/').pop(),
  sourceContent,
});

const packageRecord = ({ packages = [], frameworks = [], detectedFiles = [], packageFiles = ['package.json'] }) => ({
  packages,
  frameworks,
  packageFiles,
  detectedFiles,
});

const categoriesOf = (input) => new Set(input.evidencePreview.sourceFiles.map((item) => item.category));
const fileByPath = (input, path) => input.evidencePreview.sourceFiles.find((item) => item.path === path);
const hasRole = (input, role) => input.evidencePreview.sourceFiles.some((item) => item.roleHints.includes(role));

const build = (name, packages, detectedFiles, frameworks = []) => buildDev2VecInputFromRepositoryAnalysis({
  requestId: `taxonomy-${name}`,
  repository: {
    name,
    fullName: `example/${name}`,
    description: `${name} fixture`,
    language: 'TypeScript',
  },
  packages: [packageRecord({ packages, frameworks, detectedFiles })],
  commits: [],
  issues: [],
});

const frontend = build('frontend-fixture', [
  'react',
  'react-dom',
  'vite',
  'react-router-dom',
  'tailwindcss',
  'zustand',
  'axios',
], [
  file('package.json', '{"dependencies":{"react":"latest","react-dom":"latest","vite":"latest","react-router-dom":"latest","tailwindcss":"latest","zustand":"latest","axios":"latest"}}'),
  file('src/components/App.tsx', 'export function App(){ return <main className="p-4">Hello</main>; }'),
  file('src/pages/Home.tsx', 'import { Link } from "react-router-dom"; export const Home = () => <Link to="/x" />;'),
  file('src/hooks/useAuth.ts', 'import { useEffect } from "react"; export function useAuth() { useEffect(() => {}, []); }'),
  file('src/store/userStore.ts', 'import { create } from "zustand"; export const useUserStore = create(() => ({}));'),
  file('src/services/api.ts', 'import axios from "axios"; export const api = axios.create({ baseURL: "/api" });'),
  file('src/styles/main.css', '.app { display: grid; }'),
], ['React', 'Vite', 'Frontend routing', 'Frontend styling']);

assert(hasRole(frontend, 'frontend'));
assert.strictEqual(fileByPath(frontend, 'src/services/api.ts').category, 'frontend_api_client');
assert(!categoriesOf(frontend).has('backend_database'));

const mobile = build('mobile-fixture', [
  'react-native',
  'expo',
  '@react-navigation/native',
  '@react-navigation/stack',
  'axios',
], [
  file('package.json', '{"dependencies":{"react-native":"latest","expo":"latest","@react-navigation/native":"latest","axios":"latest"}}'),
  file('app.json', '{"expo":{"name":"Mobile App"}}'),
  file('eas.json', '{"build":{"production":{}}}'),
  file('src/screens/Home.tsx', 'import { SafeAreaView, Text } from "react-native"; export function HomeScreen(){ return <SafeAreaView><Text>Hi</Text></SafeAreaView>; }'),
  file('src/navigation/AppNavigator.tsx', 'import { NavigationContainer } from "@react-navigation/native"; export const AppNavigator = NavigationContainer;'),
  file('src/services/api.ts', 'import axios from "axios"; export const api = axios.create({ baseURL: "/api" });'),
  file('android/app/src/main/AndroidManifest.xml', '<manifest package="com.example.mobile"></manifest>'),
  file('ios/App/Info.plist', '<plist></plist>'),
], ['React Native/Expo', 'Mobile navigation']);

assert(hasRole(mobile, 'mobile'));
assert.strictEqual(fileByPath(mobile, 'src/services/api.ts').category, 'mobile_api_client');
assert(categoriesOf(mobile).has('mobile_native_android'));
assert(categoriesOf(mobile).has('mobile_native_ios'));

const backend = build('backend-fixture', [
  'express',
  'mongoose',
  'jsonwebtoken',
  'bcrypt',
], [
  file('package.json', '{"dependencies":{"express":"latest","mongoose":"latest","jsonwebtoken":"latest","bcrypt":"latest"}}'),
  file('src/routes/user.routes.js', 'const router = require("express").Router(); router.get("/users", controller.list);'),
  file('src/controllers/user.controller.js', 'exports.list = (req, res) => res.json([]);'),
  file('src/services/user.service.js', 'const User = require("../models/User"); exports.find = () => User.find();'),
  file('src/models/User.js', 'const schema = new mongoose.Schema({ email: String }); module.exports = mongoose.model("User", schema);'),
  file('src/middlewares/auth.middleware.js', 'const jwt = require("jsonwebtoken"); module.exports = (req, res, next) => next();'),
], ['Backend HTTP framework', 'Database/ORM', 'Backend authentication']);

assert(hasRole(backend, 'backend'));
assert(categoriesOf(backend).has('backend_route'));
assert(categoriesOf(backend).has('backend_database'));
assert(categoriesOf(backend).has('backend_authentication'));

const devops = build('devops-fixture', [
  'express',
], [
  file('Dockerfile', 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .'),
  file('docker-compose.yml', 'services:\n  api:\n    build: .'),
  file('.github/workflows/ci.yml', 'name: ci\njobs:\n  test:\n    runs-on: ubuntu-latest'),
  file('terraform/main.tf', 'resource "aws_instance" "app" {}'),
  file('k8s/deployment.yaml', 'apiVersion: apps/v1\nkind: Deployment'),
], ['DevOps tooling']);

assert(hasRole(devops, 'devops'));
assert(categoriesOf(devops).has('devops_container'));
assert(categoriesOf(devops).has('devops_ci_cd'));
assert(categoriesOf(devops).has('devops_infrastructure'));
assert(categoriesOf(devops).has('devops_orchestration'));

const data = build('data-fixture', [
  'pandas',
  'numpy',
  'scikit-learn',
  'torch',
  'matplotlib',
], [
  file('requirements.txt', 'pandas\nnumpy\nscikit-learn\ntorch\nmatplotlib'),
  file('notebooks/eda.ipynb', '{"cells":[]}'),
  file('preprocessing/clean.py', 'import pandas as pd\ndef clean(df): return df.dropna()'),
  file('training/train_model.py', 'from sklearn.model_selection import train_test_split\nmodel.fit(X, y)'),
  file('models/model.py', 'import torch\nclass Classifier(torch.nn.Module): pass'),
  file('reports/plot.py', 'import matplotlib.pyplot as plt\nplt.plot([1,2])'),
], ['Data/ML tooling']);

assert(hasRole(data, 'data'));
assert(categoriesOf(data).has('data_notebook'));
assert(categoriesOf(data).has('data_preprocessing'));
assert(categoriesOf(data).has('data_ml_training'));
assert(categoriesOf(data).has('data_model'));

const pythonOnly = build('python-generic-fixture', ['python-dotenv'], [
  file('scripts/cleanup.py', 'print("cleanup")'),
], []);
assert(!hasRole(pythonOnly, 'data'));

const mixed = build('mixed-fixture', [
  'react',
  'vite',
  'express',
  'mongoose',
], [
  file('package.json', '{"dependencies":{"react":"latest","vite":"latest","express":"latest","mongoose":"latest"}}'),
  file('src/components/App.tsx', 'export const App = () => <div />;'),
  file('src/routes/user.routes.js', 'const router = require("express").Router(); router.get("/users", list);'),
  file('Dockerfile', 'FROM node:20-alpine'),
], ['React', 'Vite', 'Backend HTTP framework', 'Database/ORM']);

assert(hasRole(mixed, 'frontend'));
assert(hasRole(mixed, 'backend'));
assert(hasRole(mixed, 'devops'));

console.log('PASS: Dev2Vec evidence taxonomy fixtures');
