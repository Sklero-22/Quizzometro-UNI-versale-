// Nel browser non esiste l'accesso alle cartelle del telefono: il backup si fa con "Salva una copia JSON".
import type { AppData } from '../domain/types';

export interface LocalBackupFile {
  name: string;
  uri: string;
}

const unsupported = () => new Error('I backup in cartella non sono disponibili nella versione web.');

export async function getSavedBackupDirectory(): Promise<string | null> {
  return null;
}
export async function chooseBackupDirectory(_initialUri?: string | null): Promise<string | null> {
  throw unsupported();
}
export function backupDirectoryLabel(_uri: string): string {
  return '';
}
export async function listLocalBackups(_directoryUri: string): Promise<LocalBackupFile[]> {
  return [];
}
export async function saveLocalBackup(_directoryUri: string, _data: AppData): Promise<LocalBackupFile> {
  throw unsupported();
}
export async function readLocalBackup(_uri: string): Promise<string> {
  throw unsupported();
}
