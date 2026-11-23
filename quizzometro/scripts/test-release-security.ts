import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  bytesToHex,
  decodeBase64Bytes,
  isTrustedGitHubReleaseAssetUrl,
  isTrustedQuizzometroApkUrl,
  normalizeSha256Digest,
  parseGitHubReleasePage,
} from '../src/data/releaseSecurity';

const releasePage = 'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/tag/v1.0.9';
const release = parseGitHubReleasePage(releasePage);
assert.deepEqual(release, {
  owner: 'Sklero-22',
  repo: 'Quizzometro-UNI-versale-',
  tag: 'v1.0.9',
});

assert.equal(
  isTrustedGitHubReleaseAssetUrl(
    'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.9/Quizzometro.apk',
    release!,
    'Quizzometro.apk',
  ),
  true,
);
assert.equal(
  isTrustedQuizzometroApkUrl(
    'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.11/Quizzometro.apk',
  ),
  true,
);
for (const url of [
  'http://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.11/Quizzometro.apk',
  'https://evil.example/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.11/Quizzometro.apk',
  'https://github.com/another/repo/releases/download/v1.0.11/Quizzometro.apk',
  'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/tag/v1.0.11',
  'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.11/file.zip',
  'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.11/Quizzometro.apk?redirect=evil',
  'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1%2F0.11/Quizzometro.apk',
  'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.11/file%2Fother.apk',
]) {
  assert.equal(isTrustedQuizzometroApkUrl(url), false);
}
for (const url of [
  'http://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.9/Quizzometro.apk',
  'https://evil.example/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.9/Quizzometro.apk',
  'https://github.com/another/repo/releases/download/v1.0.9/Quizzometro.apk',
  'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.8/Quizzometro.apk',
  'https://github.com/Sklero-22/Quizzometro-UNI-versale-/releases/download/v1.0.9/Quizzometro.apk?redirect=evil',
]) {
  assert.equal(isTrustedGitHubReleaseAssetUrl(url, release!, 'Quizzometro.apk'), false);
}

assert.equal(normalizeSha256Digest(`sha256:${'A'.repeat(64)}`), 'a'.repeat(64));
assert.equal(normalizeSha256Digest('md5:0123456789abcdef'), null);
assert.equal(normalizeSha256Digest('not-a-digest'), null);

const hello = decodeBase64Bytes('aGVsbG8=');
assert.equal(new TextDecoder().decode(hello), 'hello');
assert.equal(bytesToHex(hello), '68656c6c6f');
assert.equal(
  createHash('sha256').update(hello).digest('hex'),
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
);

console.log('Verificati i link GitHub, l’estrazione Base64 e il formato SHA-256.');
