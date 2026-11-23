import Constants from 'expo-constants';
import { Linking } from 'react-native';
import type { ReleaseInfo } from '../domain/types';
import {
  isTrustedGitHubReleaseAssetUrl,
  isTrustedQuizzometroApkUrl,
  normalizeSha256Digest,
  parseGitHubReleasePage,
} from './releaseSecurity';

export const INSTALLED_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
const LATEST_RELEASE_URL = 'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/latest';

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
  digest?: string | null;
  size?: number;
}

export async function fetchLatestRelease(repoUrl: string): Promise<ReleaseInfo> {
  const repo = parseRepo(repoUrl);
  if (!repo) throw new Error('URL del repository non valido: usa https://github.com/proprietario/repository');
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/releases/latest`,
    {
      headers: { Accept: 'application/vnd.github+json' },
    },
  );
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
  const htmlUrl = json.html_url ?? null;
  const releaseRef = htmlUrl ? parseGitHubReleasePage(htmlUrl) : null;
  if (
    !releaseRef ||
    releaseRef.owner.toLowerCase() !== repo.owner.toLowerCase() ||
    releaseRef.repo.toLowerCase() !== repo.repo.toLowerCase() ||
    releaseRef.tag !== tag
  ) {
    throw new Error('GitHub ha restituito un collegamento alla release non previsto.');
  }
  const apks = (json.assets ?? []).filter(
    (asset) =>
      /\.apk$/i.test(asset.name ?? '') &&
      !!asset.name &&
      !!asset.browser_download_url &&
      isTrustedGitHubReleaseAssetUrl(asset.browser_download_url, releaseRef, asset.name),
  );
  const preferred = apks.find((a) => /universal|universale|all-abi/i.test(a.name ?? '')) ?? apks[0];
  return {
    tag,
    name: json.name || tag,
    version: tag.slice(1),
    apkUrl: preferred?.browser_download_url ?? null,
    apkName: preferred?.name ?? null,
    apkSha256: normalizeSha256Digest(preferred?.digest),
    apkSize: preferred?.size ?? null,
    htmlUrl,
    publishedAt: json.published_at ?? null,
  };
}

export async function downloadAndInstall(release: ReleaseInfo): Promise<void> {
  const url = isTrustedQuizzometroApkUrl(release.apkUrl) ? release.apkUrl : LATEST_RELEASE_URL;
  await Linking.openURL(url);
}

/** Testi dei pulsanti di aggiornamento (nella versione web sono diversi). */
export const UPDATE_ACTION_LABEL = 'Scarica aggiornamento';
export const UPDATE_NOTE =
  'Il download parte nel browser. Al termine tocca la notifica del download e poi Installa. Le tue materie restano.';
