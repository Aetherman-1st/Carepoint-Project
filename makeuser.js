const bcrypt = require('bcrypt');
const pool = require('./db');

async function makeUser() {
  const email = 'test@example.com';
  const password = 'test1234';

  const hashed = await bcrypt.hash(password, 10);

  try {
    await pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', [email, hashed]);
    console.log('Test user created');
  } catch (err) {
    console.log('Error creating user');
  }

  pool.end();
}

makeUser();
