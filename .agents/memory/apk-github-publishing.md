---
name: Pubblicazione APK
description: Preferenza dell’utente per il caricamento delle versioni Android di Quizzometro su GitHub.
---

Per Quizzometro, l’utente carica e sostituisce autonomamente le versioni APK su GitHub. Preparare, firmare, verificare e consegnare il file APK; non pubblicare o sostituire release/asset GitHub.

**Why:** l’utente ha chiesto esplicitamente di gestire personalmente tutti i caricamenti delle versioni APK.

**How to apply:** per i prossimi aggiornamenti di Quizzometro, consegnare l’APK firmato come file scaricabile e lasciare all’utente ogni caricamento su GitHub.

Prima di dichiarare corretta una grafica, verificare la schermata effettivamente visualizzata: la presenza di risorse aggiornate nell’APK non dimostra che la schermata di ingresso o l’icona appaiano corrette.

**Why:** la build 1.0.6 includeva risorse launcher aggiornate, ma la schermata iniziale continuava a mostrare gli angoli chiari; la verifica aveva controllato il pacchetto, non il risultato visivo.

**How to apply:** per gli APK con correzioni visive, confrontare la schermata e gli asset realmente usati nell’app tramite anteprima o dispositivo prima di consegnare la versione.

Per il file APK consegnato, usa il nome `Quizzometro-UNI-versale-v{versione}-vc{versionCode}.apk`, aggiornando entrambi i valori a quelli effettivi della build.

**Why:** l’utente vuole mantenere un nome file coerente con la versione e il codice Android, ad esempio `Quizzometro-UNI-versale-v1.0.11-vc12.apk`.

**How to apply:** rinomina o copia l’APK firmato dopo la compilazione e prima della consegna; non caricarlo su GitHub.
