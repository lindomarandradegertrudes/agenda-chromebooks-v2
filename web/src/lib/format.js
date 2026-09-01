// Converte para o formato de data usado no Brasil: DD/MM/AAAA.
//
// O caminho normal recebe a string "AAAA-MM-DD" que o app grava nas reservas.
// Mas o Firestore acabou acumulando alguns documentos antigos com `data` em
// outros formatos (Timestamp, Date, string ISO com hora, ou string já em
// DD/MM/AAAA). Em vez de deixar a tela quebrar ou exibir mês/dia trocados,
// esta função normaliza qualquer um desses casos. O ideal é rodar também o
// script functions/scripts/diagnosticar-datas.js e migrar os documentos —
// isto aqui é só a rede de segurança da exibição.
export function fmtDataBR(data) {
  const iso = toISODate(data);
  if (!iso) return typeof data === 'string' ? data : '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Devolve sempre "AAAA-MM-DD" (data local, sem fuso) ou null se não der pra
// interpretar. Exportada porque a migração e as regras de janela também
// precisam da mesma normalização.
export function toISODate(valor) {
  if (valor == null || valor === '') return null;

  // Firestore Timestamp (tem .toDate()) ou objeto { seconds, nanoseconds }.
  if (typeof valor === 'object') {
    if (typeof valor.toDate === 'function') return dateParaISO(valor.toDate());
    if (typeof valor.seconds === 'number') return dateParaISO(new Date(valor.seconds * 1000));
    if (valor instanceof Date) return dateParaISO(valor);
    return null;
  }

  if (typeof valor === 'number') return dateParaISO(new Date(valor));

  const s = String(valor).trim();

  // "AAAA-MM-DD" possivelmente seguido de "T..." (string ISO com hora).
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [, y, mes, dia] = m;
    return `${y}-${pad(mes)}-${pad(dia)}`;
  }

  // "DD/MM/AAAA" — já no formato BR.
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dia, mes, y] = m;
    return `${y}-${pad(mes)}-${pad(dia)}`;
  }

  // Última tentativa: deixar o JS interpretar (ex.: "Wed Sep 02 2026 ...").
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : dateParaISO(d);
}

function dateParaISO(d) {
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Só pra exibição — o valor curto ("Segunda", "Terça"...) continua sendo o
// usado nos dados/regras da grade (GRADE_SEMANA, reservas no Firestore etc.).
const DIA_COM_FEIRA = {
  Segunda: 'Segunda-feira',
  Terça: 'Terça-feira',
  Quarta: 'Quarta-feira',
  Quinta: 'Quinta-feira',
  Sexta: 'Sexta-feira',
};

export function diaSemanaCompleto(dia) {
  return DIA_COM_FEIRA[dia] || dia;
}
