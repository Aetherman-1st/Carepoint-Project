const express = require('express');
const loginRoute = require('./routes/login');
const signupRoute = require('./routes/signup');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.use('/login', loginRoute);
app.use('/signup', signupRoute);

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
