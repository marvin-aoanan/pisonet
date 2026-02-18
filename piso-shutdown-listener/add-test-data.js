const fs = require('fs');

// Read current database
const dbFile = 'pisonet-db.json';
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

// Add some test coin inserts (revenue)
const now = new Date();
const today = now.toISOString();

// Add some coins for today
for (let i = 0; i < 10; i++) {
  db.coinInserts.push({
    id: Date.now() + i,
    unitId: Math.floor(Math.random() * 10) + 1,
    coinValue: [1, 5, 10][Math.floor(Math.random() * 3)],
    insertedAt: today
  });
}

// Add some active timers
db.timers['1'] = {
  remainingSeconds: 300,
  totalRevenue: 15,
  lastUpdated: today
};

db.timers['2'] = {
  remainingSeconds: 600,
  totalRevenue: 25,
  lastUpdated: today
};

db.timers['5'] = {
  remainingSeconds: 150,
  totalRevenue: 10,
  lastUpdated: today
};

// Write back to database
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

console.log('✓ Test data added to database');
console.log(`  - ${db.coinInserts.length} coin inserts`);
console.log(`  - ${Object.keys(db.timers).length} active timers`);
console.log('  - PC 1: 5 minutes remaining, ₱15 revenue');
console.log('  - PC 2: 10 minutes remaining, ₱25 revenue');
console.log('  - PC 5: 2.5 minutes remaining, ₱10 revenue');
