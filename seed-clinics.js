require('dotenv').config();
const pool = require('./db');

const CLINICS = [
  {
    name: 'Ahmad Clinic',
    specialty: null,
    image_url: '/images/clinics/ahmad-clinic.jpeg'
  },
  {
    name: 'CarePoint Medical Clinic',
    specialty: null,
    image_url: '/images/clinics/carepoint-medical-clinic.jpeg'
  },
  {
    name: 'Dentist Hashem Clinic',
    specialty: 'Dentistry',
    image_url: '/images/clinics/dentist-hashem-clinic.jpeg'
  }
];

async function run() {
  for (const clinic of CLINICS) {
    await pool.query(
      `INSERT INTO clinics (name, specialty, image_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE
       SET specialty = COALESCE(clinics.specialty, EXCLUDED.specialty),
           image_url = COALESCE(clinics.image_url, EXCLUDED.image_url)`,
      [clinic.name, clinic.specialty, clinic.image_url]
    );
  }

  const result = await pool.query('SELECT name, specialty, image_url FROM clinics ORDER BY name');
  console.log(`Seeded ${result.rowCount} clinics.`);
  for (const clinic of result.rows) {
    console.log(
      `- ${clinic.name}${clinic.specialty ? ` (${clinic.specialty})` : ''}${
        clinic.image_url ? ` [${clinic.image_url}]` : ''
      }`
    );
  }
  await pool.end();
}

run().catch(async (err) => {
  console.error('Clinic seed failed:', err.message);
  await pool.end();
  process.exit(1);
});
