const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_DIR = path.join(__dirname, 'db');
const DB_PATH = path.join(DB_DIR, 'ttangbu.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Ensure db directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Check if reset flag is passed
const shouldReset = process.argv.includes('--reset');

if (shouldReset) {
  console.log('🔄 Resetting database...');
  if (fs.existsSync(DB_PATH)) {
    const tempDb = new Database(DB_PATH);
    tempDb.close();
    fs.unlinkSync(DB_PATH);
    console.log('✅ Database deleted');
  }
}

const db = new Database(DB_PATH);

// Enable foreign keys (SQLite default is OFF)
db.pragma('foreign_keys = ON');

// Get all migration files
const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`📂 Found ${migrationFiles.length} migration file(s)`);

let appliedCount = 0;

migrationFiles.forEach(file => {
  const migrationPath = path.join(MIGRATIONS_DIR, file);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    // Check if migration was already applied
    let migrationApplied = false;
    try {
      const result = db.prepare('SELECT name FROM migrations WHERE name = ?').get(file);
      migrationApplied = !!result;
    } catch (err) {
      // migrations table doesn't exist yet, proceed with migration
      migrationApplied = false;
    }
    
    if (migrationApplied) {
      console.log(`⏭️  Skipping ${file} (already applied)`);
      return;
    }
    
    // Apply migration
    db.exec(sql);
    
    // Record migration as applied
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    
    appliedCount++;
    console.log(`✅ Applied ${file}`);
  } catch (err) {
    console.error(`❌ Error applying ${file}:`, err.message);
    process.exit(1);
  }
});

db.close();

console.log(`\n🎉 Migration complete! Applied ${appliedCount} migration(s)`);
console.log(`📍 Database: ${DB_PATH}`);
