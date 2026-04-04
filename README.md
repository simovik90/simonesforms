# MyTypeform

Clone di Typeform: crei i form tu, i **clienti** li compilano tramite un link. Le risposte si salvano sul server e le vedi in **Risultati**.

## Avvio (con server e salvataggio risposte)

Per usare i form con i clienti serve il server Node che salva form e risposte su file:

```bash
cd /Users/simonevicario/typeform
npm install
npm start
```

Apri **http://localhost:3333**.

- **Tu**: crei e modifichi i form dalla dashboard, vedi i risultati.
- **Clienti**: gli invii il link **Link clienti** (o il link diretto tipo `http://tuo-indirizzo:3333/fill/FORM_ID`). Aprendo quel link vedono solo il form da compilare; le risposte arrivano sul server e le vedi in **Risultati**.

In rete (stesso Wi‑Fi): condividi `http://<tuo-ip>:3333/fill/FORM_ID` (es. `http://192.168.1.250:3333/fill/f_123`).

### Pipeline e automazioni
- **Pipeline**: dalla dashboard clicca **Pipeline** su un form. I lead (risposte) sono organizzati in colonne per fase (Nuovo, Contattato, Qualificato, ecc.). Puoi spostare un lead in un’altra fase dal menu sulla card.
- **Automazioni**: in modifica form, in fondo, **Pipeline e automazioni**. Definisci le fasi della pipeline, quali domande sono “email” e “nome” per le card lead, e le **automazioni**: “Quando qualcuno invia il form, **se** (condizioni) **allora** (imposta fase / chiama webhook)”. Il webhook riceve un POST JSON con formId, responseId, answers, stage (utile per Zapier, Make, ecc.).
- **Generazione lead**: ogni risposta è un lead con fase; usa la pipeline per seguire i contatti e le automazioni per assegnare la fase in base alle risposte o per notificare sistemi esterni.

## Solo in locale (senza server)

Se avvii con `npx serve . -p 3333` form e risposte restano nel **localStorage** del browser: nessun link per clienti, uso solo personale.

### Eliminazione e refresh

Per **salvare davvero** creazione ed eliminazione dei form (anche dopo F5) usa **`npm start`**, non `npx serve`. Con il server Node le modifiche vanno in `data/forms.json`. Con `npx serve` i dati sono solo nel browser e il tasto Elimina aggiorna solo il localStorage.
