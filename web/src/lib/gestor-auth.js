import { httpsCallable, FunctionsError } from 'firebase/functions';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { functions, auth } from './firebase';

export async function autenticarGestor(codigo) {
  const chamar = httpsCallable(functions, 'autenticarGestor');
  try {
    const { data } = await chamar({ codigo });
    await signInWithCustomToken(auth, data.token);
  } catch (err) {
    if (err instanceof FunctionsError && err.code === 'functions/permission-denied') {
      throw new Error('Código incorreto.');
    }
    throw new Error('Não foi possível entrar. Tente novamente.');
  }
}

export async function sairGestor() {
  await signOut(auth);
}
