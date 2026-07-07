const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const OLD_INDEX_NAME = 'normalizedSkillName_1_normalizedTargetRole_1_level_1';
const NEW_INDEX_NAME = 'normalizedSkillName_1_normalizedTargetRole_1_level_1_language_1';
const NEW_INDEX_KEYS = {
  normalizedSkillName: 1,
  normalizedTargetRole: 1,
  level: 1,
  language: 1,
};

const getMongoUri = () => process.env.MONGO_URI || process.env.MONGODB_URI;

const logIndexes = async (collection, label) => {
  const indexes = await collection.indexes();
  console.log(label);
  for (const index of indexes) {
    console.log(`- ${index.name}: ${JSON.stringify(index.key)} unique=${Boolean(index.unique)}`);
  }
  return indexes;
};

const run = async () => {
  const mongoUri = getMongoUri();

  if (!mongoUri) {
    throw new Error('MONGO_URI is not configured');
  }

  await mongoose.connect(mongoUri);
  const collection = mongoose.connection.db.collection('learningcontents');

  const initialIndexes = await logIndexes(collection, 'Current learningcontents indexes:');

  const updateResult = await collection.updateMany(
    { language: { $exists: false } },
    { $set: { language: 'en' } }
  );
  console.log(`Updated old documents missing language: ${updateResult.modifiedCount || 0}`);

  const hasOldIndex = initialIndexes.some((index) => index.name === OLD_INDEX_NAME);
  if (hasOldIndex) {
    await collection.dropIndex(OLD_INDEX_NAME);
    console.log(`Dropped old index if exists: ${OLD_INDEX_NAME}`);
  } else {
    console.log(`Dropped old index if exists: skipped, ${OLD_INDEX_NAME} not found`);
  }

  await collection.createIndex(NEW_INDEX_KEYS, {
    unique: true,
    name: NEW_INDEX_NAME,
  });
  console.log(`Created new language-aware unique index: ${NEW_INDEX_NAME}`);

  await logIndexes(collection, 'Updated learningcontents indexes:');
  console.log('Done');
};

run()
  .catch((error) => {
    console.error('Failed to fix LearningContent indexes:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
