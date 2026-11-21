import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import type { ReleaseInfo } from '../domain/types';

export const INSTALLED_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

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

interface GhAsset {
  name?: string;
  browser_download_url?: string;
}

export async function fetchLatestRelease(repoUrl: string): Promise<ReleaseInfo> {
  const repo = parseRepo(repoUrl);
  if (!repo) throw new Error('URL del repository non valido: usa https://github.com/proprietario/repository');
  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) throw new Error('Nessuna release pubblica trovata nel repository.');
  if (!res.ok) throw new Error(`GitHub ha risposto con errore ${res.status}.`);
  const json = (await res.json()) as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    published_at?: string;
    assets?: GhAsset[];
  };
  const tag = json.tag_name ?? '';
  if (!parseVersionTag(tag)) throw new Error(`Il tag "${tag}" non ha il formato vX.Y.Z.`);
  const apks = (json.assets ?? []).filter((a) => /\.apk$/i.test(a.name ?? '') && a.browser_download_url);
  const preferred = apks.find((a) => /universal|universale|all-abi/i.test(a.name ?? '')) ?? apks[0];
  return {
    tag,
    name: json.name || tag,
    version: tag.slice(1),
    apkUrl: preferred?.browser_download_url ?? null,
    apkName: preferred?.name ?? null,
    htmlUrl: json.html_url ?? null,
    publishedAt: json.published_at ?? null,
  };
}

export async function downloadAndInstall(release: ReleaseInfo, onProgress?: (p: number) => void): Promise<void> {
  if (!release.apkUrl) throw new Error('La release non contiene un file APK.');
  const dest = `${FileSystem.cacheDirectory}${release.apkName ?? 'quizzometro-update.apk'}`;
  const dl = FileSystem.createDownloadResumable(release.apkUrl, dest, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const result = await dl.downloadAsync();
  if (!result || result.status >= 400) throw new Error('Download dell’APK non riuscito.');
  const uri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri,
    flags: 1,
    type: 'application/vnd.android.package-archive',
  });
}

/** Testi dei pulsanti di aggiornamento (nella versione web sono diversi). */
export const UPDATE_ACTION_LABEL = 'Scarica e installa';
export const UPDATE_NOTE =
  'L’installazione finale viene confermata dal sistema Android. L’app controlla gli aggiornamenti quando la apri o torni a usarla. Se resta aperta, ripete il controllo ogni 6 ore.';
