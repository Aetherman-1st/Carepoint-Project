const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'admin-dist');
const shared = ['style.css', 'motion.css', 'motion.js', 'charts.js', 'ui.js'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'admin-app'), out, { recursive: true });

for (const file of shared) {
  fs.copyFileSync(path.join(root, 'public', file), path.join(out, file));
}

const supabaseUmd = path.join(
  root,
  'node_modules',
  '@supabase',
  'supabase-js',
  'dist',
  'umd',
  'supabase.js'
);

if (!fs.existsSync(supabaseUmd)) {
  throw new Error('Supabase JS bundle not found. Run npm install first.');
}

fs.copyFileSync(supabaseUmd, path.join(out, 'supabase.js'));

console.log('Built admin-dist/');
