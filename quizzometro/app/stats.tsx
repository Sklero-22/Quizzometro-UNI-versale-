import { Redirect } from 'expo-router';
import React from 'react';

/** Preserva i vecchi collegamenti aprendo la nuova pagina Andamento. */
export default function StatsRedirect() {
  return <Redirect href="/progress" />;
}
