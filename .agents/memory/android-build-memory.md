---
name: Build Android con memoria limitata
description: Evita i picchi di memoria durante la compilazione delle release Android di Quizzometro.
---

Per le release Android di Quizzometro, mantieni Metro a un massimo di due worker e riduci temporaneamente l’heap Gradle a 1536 MB quando serve.

**Why:** Nel container Replit la build con tre worker Metro e heap Gradle da 2 GB è stata terminata dal sistema per esaurimento della memoria; la build con due worker e heap ridotto è riuscita.

**How to apply:** Non aumentare i worker fino al numero di CPU senza verificare prima il limite di memoria del container. Se la build viene terminata durante il bundle, limita anche l’heap Gradle prima di riprovare.

Quando Metro usa le dipendenze locali dell’app ma l’autolinking Android trova i moduli nel pnpm store del workspace, imposta `REACT_NATIVE_WORKLETS_NODE_MODULES_DIR` usando il percorso del progetto Gradle `:react-native-worklets`.

**Why:** Reanimated può altrimenti cercare `libworklets.so` nella copia locale mentre Gradle la compila nell’albero pnpm, facendo fallire il collegamento nativo.

**How to apply:** Nei progetti con risoluzione Metro e autolinking provenienti da alberi `node_modules` diversi, allinea il percorso Worklets di Reanimated al progetto effettivamente autolinkato.
