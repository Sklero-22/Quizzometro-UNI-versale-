import type { DocumentPickerAsset } from 'expo-document-picker';

/** Legge come testo un file scelto nel browser. */
export async function readPickedText(asset: DocumentPickerAsset): Promise<string> {
  const file = (asset as DocumentPickerAsset & { file?: File }).file;
  if (file) return file.text();
  const res = await fetch(asset.uri);
  return res.text();
}

/**
 * Salva un file di testo dal browser.
 * Su iPhone/iPad usa il foglio "Condividi" (permette "Salva su File"); altrove scarica il file.
 */
export async function shareTextFile(fileName: string, text: string, dialogTitle: string): Promise<void> {
  const blob = new Blob([text], { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    const file = new File([blob], fileName, { type: 'application/json' });
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: dialogTitle });
      return;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // l'utente ha annullato
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
