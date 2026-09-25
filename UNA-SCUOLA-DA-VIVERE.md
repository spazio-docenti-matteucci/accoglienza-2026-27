# Una scuola da vivere

Il modulo raccoglie due tipi di contributo dei docenti, senza password e senza calendario:

1. disponibilità ad affiancare la Commissione Orientamento in una o più scuole;
2. proposte di laboratori, lezioni aperte e altre attività per le Mattinée diffuse.

La pagina `una-scuola-da-vivere.html` è accessibile senza password. Nome, cognome,
scuole scelte e proposte sono inviati alla funzione Edge `orientamento`, che li
salva in tabelle con RLS attivo e nessun accesso diretto per `anon` o
`authenticated`. Solo una sessione `orientatore` può leggere i contributi e
aggiornarne lo stato in `orientamento.html`. Il livello `supporter` dell’area
riservata non legge questi dati.

L’elenco delle 24 scuole/sedi in 23 comuni deriva dal DOCX operativo la cui
ultima modifica interna è del 23 luglio 2026. Le denominazioni vanno confermate
prima della pubblicazione. Il catalogo pubblico `scuole-orientamento.json` e il
seed SQL hanno gli stessi identificativi. Il catalogo non contiene nomi o
recapiti dei referenti. Il nome del coordinatore compare senza numero o email.

Le richieste inviate sono `ricevuta`, non assegnazioni automatiche. La
Commissione può segnare un supporter come `assegnata` e una proposta come
`in_valutazione` o `approvata`. Date e orari saranno aggiunti soltanto quando
verranno definiti.

## Ordine di pubblicazione

1. Verificare e correggere le denominazioni delle scuole e sedi nel catalogo e nel seed SQL.
2. Applicare `supabase/sql/una-scuola-da-vivere.sql` al progetto Supabase.
3. Distribuire la versione aggiornata della funzione Edge `orientamento`, mantenendo `verify_jwt = false` e la verifica di sessione applicativa già in uso.
4. Pubblicare i file statici del repository GitHub Pages.
5. Sostituire la presentazione HTML nel bucket privato con la versione che associa le scuole alla mappa.
6. Verificare dal vivo: una richiesta di prova per ciascun percorso, comparsa nella vista `orientatore`, assenza di accesso con il livello `supporter`, assenza di dati dei referenti nei file pubblici.

Gli invii anonimi hanno un limite giornaliero per indirizzo di rete e un campo
trappola per gli invii automatici. Nome e cognome sono autodichiarati: ogni
assegnazione richiede verifica umana della Commissione.

## Classifica a punti

La pagina pubblica mostra una sfida di squadra (scuole “accese” sul totale),
il regolamento a punti e la classifica dei docenti. I punti sono calcolati solo
dalla funzione Edge (azione pubblica `leaderboard`):

| Azione | Punti |
| --- | --- |
| Disponibilità per le scuole (una volta per docente) | 5 |
| Proposta di Mattinée (non archiviata) | 10, +10 se approvata |
| Visita svolta in una scuola | 20 |
| Mattinée realizzata | 30 |
| Primo docente a visitare una scuola (Apripista) | 10 |

Le visite e le Mattinée realizzate sono registrate dalla Commissione in
`orientamento.html` (password `orientatore`, riquadro “Registra un’attività
svolta”) e finiscono nella tabella `orientamento_attivita`. Una registrazione
errata si annulla dallo stesso riquadro. I contributi dello stesso docente si
sommano confrontando nome e cognome senza accenti e maiuscole.

In classifica pubblica compaiono solo iniziale e cognome dei docenti che hanno
spuntato il consenso (`in_classifica`), in almeno un invio o nella
registrazione della Commissione. Gli altri contano soltanto nei totali di squadra.

Per attivarla: applicare `supabase/sql/una-scuola-da-vivere-classifica.sql`,
poi distribuire la funzione `orientamento` aggiornata. Finché la funzione non è
aggiornata la pagina mostra la classifica vuota e i moduli continuano a
funzionare.
