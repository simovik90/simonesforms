/**
 * Avvio server HTTP in locale (npm start). Su Vercel si usa server.js come entry (export app).
 */
const app = require('./server');
const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log('');
  console.log('  MyTypeform in ascolto su http://localhost:' + PORT);
  console.log('  Link clienti: http://localhost:' + PORT + '/fill/FORM_ID');
  console.log('  Pipeline e automazioni attive.');
  console.log('');
});
