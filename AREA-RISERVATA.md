# Area riservata Orientamento

La pagina `orientamento.html` usa la funzione Edge Supabase `orientamento`. I documenti
sono conservati nel bucket privato `orientamento-riservato`; il repository GitHub non
contiene i file riservati né le password.

Esistono due livelli:

- `orientatore`: vede tutti i documenti e può caricare, sostituire, aggiornare la visibilità
  o archiviare;
- `supporter`: consulta soltanto i documenti marcati `tutti` e non può modificarli.

Le password sono salvate soltanto come hash bcrypt nella tabella privata
`private.orientamento_accessi`. Le sessioni durano 12 ore e in database viene conservato
solo l’hash SHA-256 del token. Gli URL dei documenti scadono dopo cinque minuti.

Le sostituzioni creano una nuova versione senza cancellare la precedente. Caricamenti,
sostituzioni, modifiche dei dati e archiviazioni vengono registrati in
`orientamento_modifiche`. Poiché le credenziali sono condivise, il registro identifica il
livello usato, non la singola persona.
