---
name: Build Android con memoria limitata
description: Evita i picchi di memoria durante la compilazione delle release Android di Quizzometro.
---

Per le release Android di Quizzometro, imposta Metro a un worker, Gradle a un worker e usa `-Xmx1024m` con `MaxMetaspaceSize=640m`; limita Ninja a `-j1` se ricompila codice nativo.

**Why:** Nel container Replit, una build fredda con Gradle a 1536 MB e Metro a due worker è stata terminata dal limite di memoria mentre il bundle Android era al 99,8%. Con un worker Metro e heap Gradle da 1 GB la build firmata è riuscita.

**How to apply:** Usa questi limiti per le build Android firmate; se Metro riparte con cache vuota, mantieni un solo worker e non avviare build concorrenti.

Quando Metro usa le dipendenze locali dell’app ma l’autolinking Android trova i moduli nel pnpm store del workspace, imposta `REACT_NATIVE_WORKLETS_NODE_MODULES_DIR` usando il percorso del progetto Gradle `:react-native-worklets`.

**Why:** Reanimated può altrimenti cercare `libworklets.so` nella copia locale mentre Gradle la compila nell’albero pnpm, facendo fallire il collegamento nativo.

**How to apply:** Nei progetti con risoluzione Metro e autolinking provenienti da alberi `node_modules` diversi, allinea il percorso Worklets di Reanimated al progetto effettivamente autolinkato.

Quando usi un wrapper Ninja per una build in background, non conservare l’eseguibile originale soltanto in `/tmp`.

**Why:** Un riavvio dell’ambiente ha eliminato il backup temporaneo prima dell’esecuzione del trap, lasciando il percorso Ninja dello SDK puntato a uno script non funzionante.

**How to apply:** Conserva una copia ripristinabile in un percorso persistente del workspace, oppure usa una dipendenza di sistema gestita; controlla che la build sia terminata e che l’eseguibile sia integro prima di chiudere il lavoro.
