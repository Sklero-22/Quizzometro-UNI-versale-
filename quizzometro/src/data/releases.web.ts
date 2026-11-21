// Versione web degli aggiornamenti: invece delle release APK su GitHub,
// legge il file version.json pubblicato insieme alla web app e, se serve, ricarica la pagina.
import Constants from 'expo-constants';
import type { ReleaseInfo } from '../domain/types';

export const INSTALLED_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

export const UPDATE_ACTION_LABEL = 'Aggiorna ora';
export const UPDATE_NOTE =
  'La web app controlla gli aggiornamenti quando la apri o torni a usarla. Aggiornare non cancella materie e progressi.';

export function parseRepo(url: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function parseVersionTag(tag: string): [number, number, number] | null {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(tag: string, installed: string = INSTALLED_VERSION): boolean {
  const a = parseVersionTag(tag);
  const b = parseVersionTag('v' + installed);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function siteBase(): string {
  const base = (Constants.expoConfig?.experiments as { baseUrl?: string } | undefined)?.baseUrl ?? '';
  return `${window.location.origin}${base.replace(/\/$/, '')}/`;
}

export async function fetchLatestRelease(_repoUrl: string): Promise<ReleaseInfo> {
  const res = await fetch(`${siteBase()}version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Controllo aggiornamenti non riuscito (errore ${res.status}).`);
  const json = (await res.json()) as { version?: string };
  const version = json.version ?? '';
  const tag = `v${version}`;
  if (!parseVersionTag(tag)) throw new Error('Il file di versione della web app non è valido.');
  return {
    tag,
    name: `Quizzometro ${version}`,
    version,
    apkUrl: 'web', // segnaposto: indica che l'aggiornamento è disponibile
    apkName: null,
    htmlUrl: null,
    publishedAt: null,
  };
}

export async function downloadAndInstall(_release: ReleaseInfo, onProgress?: (p: number) => void): Promise<void> {
  onProgress?.(1);
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    window.location.reload();
  }
}
