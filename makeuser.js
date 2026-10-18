const bcrypt = require('bcrypt');
const pool = require('./db');

async function makeUser() {
  const first_name = 'Test';
  const last_name = 'User';
  const email = 'test@example.com';
  const password = 'test1234';

  const hashed = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      'INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [first_name, last_name, email, hashed]
    );
    console.log('Test user created');
  } catch (err) {
    console.log('Error creating user');
  }

  pool.end();
}

makeUser();
