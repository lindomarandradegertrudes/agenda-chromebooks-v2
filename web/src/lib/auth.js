import { GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { auth, functions } from './firebase';

export const DOMINIO_PERMITIDO = 'edu.joinville.sc.gov.br';

// Login geral do site — conta Google institucional da escola. Usa
// redirecionamento (não popup): popups do Google quebram com configurações
// de privacidade mais restritas de navegadores (Edge/Chrome bloqueando
// storage de terceiros), causando erros obscuros como
// "Database is closing/hidden". Redirecionamento não tem esse problema.
export async function entrarComGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: DOMINIO_PERMITIDO });
  await signInWithRedirect(auth, provider);
}

// Chamar uma vez ao carregar a página — completa o login depois de voltar
// do redirecionamento do Google. O `hd` acima é só uma sugestão pro Google
// mostrar as contas certas; a checagem que realmente vale é feita aqui e de
// novo nas firestore.rules (o cliente não é confiável sozinho).
export async function processarRetornoLogin() {
  const resultado = await getRedirectResult(auth);
  if (!resultado) return;
  const email = resultado.user.email || '';
  if (!email.endsWith(`@${DOMINIO_PERMITIDO}`)) {
    await signOut(auth);
    throw new Error(`Use sua conta institucional (@${DOMINIO_PERMITIDO}).`);
  }
}

// Área do gestor — marca a claim `gestor` na própria conta já logada (não
// troca de usuário) e força um refresh do ID token pra ela valer imediatamente.
export async function autenticarGestor(codigo) {
  const chamar = httpsCallable(functions, 'autenticarGestor');
  try {
    await chamar({ codigo });
    await auth.currentUser?.getIdToken(true);
  } catch (err) {
    if (err instanceof FunctionsError && err.code === 'functions/permission-denied') {
      throw new Error('Código incorreto.');
    }
    throw new Error('Não foi possível entrar. Tente novamente.');
  }
}

export const sair = () => signOut(auth);
