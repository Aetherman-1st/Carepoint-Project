require('dotenv').config();
const app = require('./app');

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`CarePoint running on http://localhost:${port}`);
});
