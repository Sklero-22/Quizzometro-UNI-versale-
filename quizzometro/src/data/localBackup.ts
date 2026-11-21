import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { AppData } from '../domain/types';
import { backupFileName, serializeBackup } from './backup';

const BACKUP_DIRECTORY_KEY = 'quizzometro:backup-directory:v1';

export interface LocalBackupFile {
  name: string;
  uri: string;
}

export async function getSavedBackupDirectory(): Promise<string | null> {
  return AsyncStorage.getItem(BACKUP_DIRECTORY_KEY);
}

export async function chooseBackupDirectory(initialUri?: string | null): Promise<string | null> {
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri ?? null);
  if (!result.granted) return null;
  await AsyncStorage.setItem(BACKUP_DIRECTORY_KEY, result.directoryUri);
  return result.directoryUri;
}

export function backupDirectoryLabel(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const tree = /\/tree\/([^/]+)\/document\//.exec(decoded)?.[1];
    if (!tree) return 'Cartella selezionata';
    const separator = tree.indexOf(':');
    if (separator < 0) return tree;
    const root = tree.slice(0, separator);
    const location = root.toLowerCase() === 'primary' ? 'Memoria interna' : root;
    const path = tree
      .slice(separator + 1)
      .split('/')
      .filter(Boolean);
    return [location, ...path].join(' / ');
  } catch {
    return 'Cartella selezionata';
  }
}

function fileNameFromUri(uri: string): string {
  try {
    return decodeURIComponent(uri).split('/').pop() ?? uri;
  } catch {
    return uri.split('/').pop() ?? uri;
  }
}

export async function listLocalBackups(directoryUri: string): Promise<LocalBackupFile[]> {
  const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);
  return uris
    .map((uri) => ({ uri, name: fileNameFromUri(uri) }))
    .filter((file) => /^quizzometro-backup-\d{8}-\d{4,9}(?:\.json)?$/i.test(file.name))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function saveLocalBackup(directoryUri: string, data: AppData): Promise<LocalBackupFile> {
  const name = backupFileName();
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(
    directoryUri,
    name.replace(/\.json$/i, ''),
    'application/json',
  );
  await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, serializeBackup(data), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return { name, uri };
}

export async function readLocalBackup(uri: string): Promise<string> {
  return FileSystem.StorageAccessFramework.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}
