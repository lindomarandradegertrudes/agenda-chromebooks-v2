import { httpsCallable, FunctionsError } from 'firebase/functions';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { functions, auth } from './firebase';

async function autenticarCom(nomeFuncao, codigo) {
  const chamar = httpsCallable(functions, nomeFuncao);
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

// Portão de entrada do site inteiro — claim `acesso: true`.
export const autenticarAcesso = (codigo) => autenticarCom('autenticarAcesso', codigo);

// Área do gestor — claim `gestor: true` (o token também inclui `acesso: true`,
// ver functions/index.js, pra não perder o acesso geral ao logar como gestor).
export const autenticarGestor = (codigo) => autenticarCom('autenticarGestor', codigo);

export const sair = () => signOut(auth);
