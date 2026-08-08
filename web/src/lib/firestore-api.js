import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

// professores

export async function listarProfessores() {
  const snap = await getDocs(query(collection(db, 'professores'), orderBy('nome')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function criarProfessor({ nome, area, email }) {
  await addDoc(collection(db, 'professores'), {
    nome,
    area,
    email: email || '',
    criadoEm: serverTimestamp(),
  });
}

// gestores

export async function listarGestores() {
  const snap = await getDocs(query(collection(db, 'gestores'), orderBy('nome')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function criarGestor({ nome, email }) {
  await addDoc(collection(db, 'gestores'), { nome, email, criadoEm: serverTimestamp() });
}

// reservas

export async function listarReservasDaData(data) {
  const snap = await getDocs(query(collection(db, 'reservas'), where('data', '==', data)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Range num único campo — não exige índice composto (ver PROJECT_SPEC.md).
export async function listarReservasNoIntervalo(inicio, fim) {
  const snap = await getDocs(
    query(collection(db, 'reservas'), where('data', '>=', inicio), where('data', '<=', fim))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Só igualdade (sem range) — não exige índice composto. Filtragem por semana
// é feita no cliente em vez de encadear outro where(), de propósito.
export async function listarReservasDoProfessor(professorId) {
  const snap = await getDocs(query(collection(db, 'reservas'), where('professorId', '==', professorId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function criarReservas(itens) {
  const batch = writeBatch(db);
  itens.forEach((item) => {
    const ref = doc(collection(db, 'reservas'));
    batch.set(ref, { ...item, criadoEm: serverTimestamp() });
  });
  await batch.commit();
}

export async function cancelarGrupo(grupoId) {
  const snap = await getDocs(query(collection(db, 'reservas'), where('grupoId', '==', grupoId)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// bloqueios

export async function listarBloqueiosDaData(data) {
  const snap = await getDocs(query(collection(db, 'bloqueios'), where('data', '==', data)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listarBloqueiosNoIntervalo(inicio, fim) {
  const snap = await getDocs(
    query(collection(db, 'bloqueios'), where('data', '>=', inicio), where('data', '<=', fim))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function criarBloqueio({ data, periodos, motivo }) {
  await addDoc(collection(db, 'bloqueios'), { data, periodos, motivo, criadoEm: serverTimestamp() });
}

export async function removerBloqueio(id) {
  await deleteDoc(doc(db, 'bloqueios', id));
}
