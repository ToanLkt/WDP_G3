require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const AnalysisResult = require('../src/models/AnalysisResult');
const RepoAnalysisSnapshot = require('../src/models/RepoAnalysisSnapshot');

const main = async () => {
  await connectDB();
  await Promise.all([
    AnalysisResult.collection.createIndex(
      { userId: 1, repositoryId: 1, analyzedAt: -1 },
      { name: 'analysis_latest_by_repository' },
    ),
    RepoAnalysisSnapshot.collection.createIndex(
      { analysisResultId: 1 },
      { name: 'snapshot_by_analysis_result' },
    ),
  ]);
  console.log('Analysis performance indexes created. No documents were migrated or deleted.');
};

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => mongoose.disconnect());
