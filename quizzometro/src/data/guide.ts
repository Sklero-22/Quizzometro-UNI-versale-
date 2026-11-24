export type GuideSection = {
  title: string;
  paragraphs: string[];
};

export type ReleaseNote = {
  version: string;
  title: string;
  summary: string;
};

export const GUIDE_PDF_URL = 'https://sklero-22.github.io/Quizzometro-UNI-versale-/Guida-Quizzometro.pdf';

export const RELEASE_NOTE_SEEN_KEY = 'quizzometro:release-note:seen-version';

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: 'Per iniziare',
    paragraphs: [
      'All’avvio aspetta che compaia Entra e toccalo per aprire il programma. La Home è divisa in quattro schede fisse: Oggi, Quiz, Progressi e Altro. Tocca una scheda per raggiungere solo le funzioni che ti servono.',
      'In Oggi trovi la materia attiva, le prove in sospeso e i ripassi recenti. Quiz serve a preparare una prova; Progressi apre il riepilogo e le statistiche; Altro raccoglie materie, domande salvate, guida, backup e aggiornamenti.',
      'Le funzioni di studio già presenti continuano a funzionare senza connessione. Internet serve per scaricare da un link e controllare gli aggiornamenti.',
    ],
  },
  {
    title: 'Materie',
    paragraphs: [
      'Apri Materie per aggiungere un corso con un file JSON o HTML dal telefono oppure con un link pubblico. Prima di salvarlo puoi controllare un’anteprima e poi confermare l’importazione.',
      'Da questa schermata puoi scegliere la materia da studiare, aggiornarla da un nuovo file o dal suo link, oppure eliminarla. I file HTML vengono letti senza eseguire il loro codice.',
      'Con Aggiungi domande puoi incollare domande nuove usando le righe LEZIONI, FONTE, DOMANDA, CORRETTA ed ERRATA. Tocca Controlla per vedere gli errori e l’anteprima: le domande già presenti non vengono duplicate e i progressi restano invariati.',
      'Condividi materia crea un file della materia e delle sue domande, senza statistiche o dati personali. Puoi inviarlo ai colleghi; chi lo riceve può importarlo da Aggiorna da file.',
    ],
  },
  {
    title: 'Preparare una prova',
    paragraphs: [
      'Scegli quante domande vuoi fare, se usare il timer e quali domande includere. Puoi restringere la prova a determinate categorie o lezioni usando i relativi filtri.',
      'Se la materia contiene domande Inedite, puoi scegliere un quiz misto (con circa il 15% di Inedite) oppure una prova dedicata. Le Inedite senza capitolo restano disponibili anche quando scegli le lezioni.',
      'Quando le scelte sono pronte, tocca Avvia prova. Se non ci sono domande adatte alle selezioni, allarga i filtri o scegli Tutte.',
    ],
  },
  {
    title: 'Durante e dopo il test',
    paragraphs: [
      'Leggi ogni domanda, scegli una risposta e continua la prova. Alla fine trovi il risultato e puoi rivedere le risposte.',
      'Quando ripeti gli errori o la prova completa, l’ordine delle domande e delle risposte cambia di nuovo. Una prova già avviata mantiene il proprio ordine.',
      'Le statistiche mostrano le domande viste, quelle corrette o sbagliate, gli argomenti da rinforzare e le sessioni recenti.',
      'Tocca il segnalibro su una domanda per ritrovarla in Domande salvate dalla Home. Da lì puoi rimuoverla o avviare un ripasso con le domande salvate della materia.',
    ],
  },
  {
    title: 'Azzera le statistiche',
    paragraphs: [
      'Nella schermata Statistiche puoi azzerare i progressi della materia selezionata. Le domande restano, ma statistiche e cronologia delle prove vengono eliminate e non si possono recuperare.',
    ],
  },
  {
    title: 'Backup e ripristino',
    paragraphs: [
      'Crea un backup per salvare materie, domande, domande salvate, progressi, prove e impostazioni in un file. La prima volta scegli una cartella del telefono; puoi cambiarla in seguito.',
      'Per ripristinare puoi sostituire tutto, unire i dati mantenendo quelli presenti solo sul telefono, oppure aggiornare soltanto ciò che esiste sia nel backup sia nell’app. Il file è in formato JSON e non è cifrato.',
      'Dopo aver disinstallato l’app Android può dimenticare il permesso per la cartella. I file restano lì: seleziona il backup dal telefono e scegli di nuovo la cartella per i backup successivi.',
    ],
  },
  {
    title: 'Aggiornamenti',
    paragraphs: [
      'L’app controlla gli aggiornamenti quando la apri e quando torni a usarla. Se resta aperta, fa anche un controllo periodico ogni 6 ore.',
      'Quando è disponibile una versione nuova, tocca Scarica aggiornamento. Il browser scarica l’APK; poi apri la notifica del download o la cartella Download e tocca Aggiorna o Installa. Le materie e i progressi restano sul telefono.',
      'Se Android chiede al browser il permesso di installare app, attiva Consenti da questa fonte e torna alla schermata di installazione.',
    ],
  },
];

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.0.15',
    title: 'Grafica più chiara in Andamento',
    summary: "Correzioni grafiche nella pagina Andamento: pulsanti del periodo leggibili, tachimetro del recupero e grafico dell'andamento più chiari",
  },
  {
    version: '1.0.14',
    title: 'Stati di apprendimento e Andamento',
    summary: 'Nuova pagina Andamento: scopri quante domande hai davvero imparato, quante hai recuperato e come procede il tuo studio',
  },
  {
    version: '1.0.13',
    title: 'Prove più varie e bilanciate',
    summary:
      'Prove più varie: domande distribuite tra tutte le lezioni scelte, mescolamento sempre nuovo e contatore di avanzamento sulle lezioni selezionate',
  },
  {
    version: '1.0.12',
    title: 'Aggiungi e condividi domande',
    summary: 'Novità: aggiungi domande incollandole dal testo e condividi la materia aggiornata con i colleghi',
  },
  {
    version: '1.0.11',
    title: 'Aggiornamenti più sicuri',
    summary: 'Il nuovo APK si scarica dal browser.',
  },
  {
    version: '1.0.10',
    title: 'Aggiornamenti verificati e permessi ridotti',
    summary: 'Rimossi tre permessi Android non necessari; prima dell’installazione l’APK viene verificato.',
  },
  {
    version: '1.0.9',
    title: 'Resoconto e riferimenti della prova',
    summary: 'Torna il resoconto a fine prova; sotto ogni risposta compaiono fonte e lezione',
  },
  {
    version: '1.0.8',
    title: 'Guida PDF e primo avvio',
    summary: 'Le nuove installazioni partono senza materie preinstallate. Puoi aprire la guida PDF e scegliere se rivedere il benvenuto.',
  },
  {
    version: '1.0.7',
    title: 'Home riorganizzata e immagine d’ingresso corretta',
    summary: 'La Home è divisa nelle schede Oggi, Quiz, Progressi e Altro. L’immagine iniziale ora ha gli angoli arrotondati senza riquadri bianchi.',
  },
  {
    version: '1.0.6',
    title: 'Quiz Inedite e icona aggiornata',
    summary: 'Puoi scegliere quiz misti o solo Inedite e ripetere i test con domande e risposte mescolate. Corretta anche l’icona Android.',
  },
  {
    version: '1.0.5',
    title: 'Guida e novità',
    summary: 'Ora trovi spiegazioni semplici delle funzioni e una cronologia delle novità; questa Nota compare dopo l’aggiornamento.',
  },
  {
    version: '1.0.4',
    title: 'Backup locale',
    summary: 'Puoi salvare un backup in una cartella scelta e ripristinare tutti i dati o soltanto quelli che vuoi mantenere.',
  },
];

export function getReleaseNote(version: string): ReleaseNote | null {
  return RELEASE_NOTES.find((note) => note.version === version) ?? null;
}

export function shouldShowReleaseNote(version: string, seenVersion: string | null): boolean {
  return getReleaseNote(version) !== null && seenVersion !== version;
}
