import { Alert, type AlertButton } from 'react-native';

/**
 * Nel browser Alert.alert di React Native non mostra nulla.
 * Lo sostituiamo con le finestre del browser (alert/confirm), mantenendo le stesse chiamate nel resto dell'app.
 */
export function installWebAlert(): void {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons ?? [];
    const cancel = list.find((b) => b.style === 'cancel');
    const actions = list.filter((b) => b.style !== 'cancel');
    if (actions.length === 0) {
      window.alert(text);
      cancel?.onPress?.();
      return;
    }
    if (actions.length === 1 && !cancel) {
      window.alert(text);
      actions[0].onPress?.();
      return;
    }
    if (actions.length === 1) {
      if (window.confirm(`${text}\n\nOK = ${actions[0].text ?? 'Conferma'}`)) actions[0].onPress?.();
      else cancel?.onPress?.();
      return;
    }
    for (const action of actions) {
      if (window.confirm(`${text}\n\n${action.text ?? 'Conferma'}?`)) {
        action.onPress?.();
        return;
      }
    }
    cancel?.onPress?.();
  };
}
