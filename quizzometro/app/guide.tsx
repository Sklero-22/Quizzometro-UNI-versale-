import { useRouter } from 'expo-router';
import React from 'react';
import { Card, H2, Label, P, Screen } from '../src/components/ui';
import { GUIDE_SECTIONS, RELEASE_NOTES } from '../src/data/guide';

export default function Guide() {
  const router = useRouter();

  return (
    <Screen title="Guida" onBack={() => router.back()}>
      <Card>
        <H2>Come usare Quizzometro</H2>
        <P>
          Qui trovi spiegazioni pratiche delle funzioni. Puoi rileggere queste indicazioni quando vuoi, anche senza
          connessione.
        </P>
      </Card>

      {GUIDE_SECTIONS.map((section) => (
        <Card key={section.title}>
          <H2>{section.title}</H2>
          {section.paragraphs.map((paragraph, index) => (
            <P key={`${section.title}-${index}`}>{paragraph}</P>
          ))}
        </Card>
      ))}

      <Card>
        <H2>Novità degli aggiornamenti</H2>
        <P>Le note restano qui, dalla versione più recente alla più vecchia.</P>
        {RELEASE_NOTES.map((note) => (
          <React.Fragment key={note.version}>
            <Label>Versione {note.version}</Label>
            <H2>{note.title}</H2>
            <P>{note.summary}</P>
          </React.Fragment>
        ))}
      </Card>
    </Screen>
  );
}
