#!/bin/bash
# Pubblica su GitHub lo stato attuale del codice (senza chiavi): la web app si aggiorna da sola.
set -e
cd ~/workspace
[ -z "$GH_TOKEN" ] && { echo "Manca il secret GH_TOKEN in Replit."; exit 1; }
URL="https://x-access-token:${GH_TOKEN}@github.com/Sklero-22/Quizzometro-UNI-versale-.git"
rm -f /tmp/idx; GIT_INDEX_FILE=/tmp/idx git add -A
if GIT_INDEX_FILE=/tmp/idx git ls-files | grep -iE "keystore|\.p12|\.enc|\.jks|\.apk|\.aab|chiavi-firma|android-sdk|gradle-home|\.env"; then
  echo "STOP: file sensibili trovati (elenco sopra). Niente è stato pubblicato."; rm -f /tmp/idx; exit 1
fi
T=$(GIT_INDEX_FILE=/tmp/idx git write-tree); rm -f /tmp/idx
git fetch -q "$URL" main
if [ "$T" = "$(git rev-parse 'FETCH_HEAD^{tree}')" ]; then echo "Nessuna modifica da pubblicare."; exit 0; fi
V=$(node -p "require('./quizzometro/app.json').expo.version")
C=$(git commit-tree "$T" -p FETCH_HEAD -m "Versione $V")
git push -q "$URL" "$C:refs/heads/main"
echo "Fatto: versione $V inviata. La web app sarà aggiornata tra 3-5 minuti."
