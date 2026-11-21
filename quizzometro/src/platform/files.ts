import type { DocumentPickerAsset } from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/** Legge come testo un file scelto con DocumentPicker (versione Android/iOS nativa). */
export async function readPickedText(asset: DocumentPickerAsset): Promise<string> {
  return FileSystem.readAsStringAsync(asset.uri);
}

/** Salva/condivide un file di testo (versione nativa: foglio di condivisione di sistema). */
export async function shareTextFile(fileName: string, text: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('La condivisione non è disponibile su questo dispositivo.');
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, text);
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle, UTI: 'public.json' });
}
