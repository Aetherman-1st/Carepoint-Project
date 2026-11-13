const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });

const privateDir = path.join(root, 'private');
for (const entry of fs.readdirSync(privateDir)) {
  if (entry === 'admin.html' || entry === 'admin.js') continue;
  fs.cpSync(path.join(privateDir, entry), path.join(dist, entry), { recursive: true });
}

console.log('Copied public and non-admin private assets to dist/');
