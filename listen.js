/**
 * Avvio server HTTP in locale (npm start). Su Vercel non si usa: solo api/* e process.env.
 */
const { app } = require('./server');
const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log('');
  console.log('  MyTypeform in ascolto su http://localhost:' + PORT);
  console.log('  Link clienti: http://localhost:' + PORT + '/fill/FORM_ID');
  console.log('  Pipeline e automazioni attive.');
  console.log('');
});
