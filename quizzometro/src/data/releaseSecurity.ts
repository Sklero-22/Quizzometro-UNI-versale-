export interface GitHubReleaseReference {
  owner: string;
  repo: string;
  tag: string;
}

export const MAX_VERIFIED_APK_BYTES = 100 * 1024 * 1024;

function decodePathSegments(url: URL): string[] | null {
  try {
    return url.pathname.split('/').slice(1).map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

function isTrustedGitHubUrl(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.hostname === 'github.com' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === ''
  );
}

export function parseGitHubReleasePage(value: string): GitHubReleaseReference | null {
  try {
    const url = new URL(value);
    if (!isTrustedGitHubUrl(url)) return null;

    const segments = decodePathSegments(url);
    if (!segments || segments.length !== 5) return null;
    const [owner, repo, releases, tagRoute, tag] = segments;
    if (!owner || !repo || releases !== 'releases' || tagRoute !== 'tag' || !tag) return null;
    return { owner, repo, tag };
  } catch {
    return null;
  }
}

export function isTrustedGitHubReleaseAssetUrl(
  value: string,
  release: GitHubReleaseReference,
  assetName: string,
): boolean {
  if (!assetName || assetName.includes('/') || assetName.includes('\\')) return false;

  try {
    const url = new URL(value);
    if (!isTrustedGitHubUrl(url)) return false;

    const segments = decodePathSegments(url);
    if (!segments || segments.length !== 6) return false;
    const [owner, repo, releases, download, tag, name] = segments;
    return (
      owner.toLowerCase() === release.owner.toLowerCase() &&
      repo.toLowerCase() === release.repo.toLowerCase() &&
      releases === 'releases' &&
      download === 'download' &&
      tag === release.tag &&
      name === assetName
    );
  } catch {
    return false;
  }
}

export function isTrustedQuizzometroApkUrl(value: string | null | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'github.com' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return false;
    }

    const segments = decodePathSegments(url);
    if (!segments || segments.length !== 6) return false;
    const [owner, repo, releases, download, tag, filename] = segments;
    return (
      owner.toLowerCase() === 'sklero-22' &&
      repo.toLowerCase() === 'quizzometro-uni-versale-' &&
      releases === 'releases' &&
      download === 'download' &&
      !!tag &&
      !tag.includes('/') &&
      !tag.includes('\\') &&
      !filename.includes('/') &&
      !filename.includes('\\') &&
      /\.apk$/i.test(filename)
    );
  } catch {
    return false;
  }
}

export function normalizeSha256Digest(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(?:sha256:)?([a-f0-9]{64})$/i.exec(value.trim());
  return match?.[1].toLowerCase() ?? null;
}

export function decodeBase64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/\s+/g, '');
  if (!base64 || typeof globalThis.atob !== 'function') {
    throw new Error('Non è stato possibile leggere il file per verificarne l’integrità.');
  }

  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
