// Configuração oficial do horário da Escola Agrícola Municipal Carlos Heins Funke.
// Extraída diretamente do app atual (artefato HTML) para manter os dois em sincronia.
// Se o horário oficial mudar, ajuste aqui.

export const PERIODOS_MANHA = [
  { id: 'M1', label: '1ª aula', inicio: '07:15', fim: '08:03' },
  { id: 'M2', label: '2ª aula', inicio: '08:03', fim: '08:51' },
  { id: 'REC1', label: 'Recreio', inicio: '08:51', fim: '09:06', pausa: true },
  { id: 'M3', label: '3ª aula', inicio: '09:06', fim: '09:54' },
  { id: 'M4', label: '4ª aula', inicio: '09:54', fim: '10:42' },
  { id: 'M5', label: '5ª aula', inicio: '10:42', fim: '11:30' },
];

export const ALMOCO = { id: 'ALM', label: 'Almoço', inicio: '11:30', fim: '12:30', pausa: true };

export const PERIODOS_TARDE = [
  { id: 'T1', label: '1ª aula', inicio: '12:30', fim: '13:18' },
  { id: 'T2', label: '2ª aula', inicio: '13:18', fim: '14:05' },
  { id: 'T3', label: '3ª aula', inicio: '14:05', fim: '14:54' },
  { id: 'REC2', label: 'Recreio', inicio: '14:54', fim: '15:09', pausa: true },
  { id: 'T4', label: '4ª aula', inicio: '15:09', fim: '15:57' },
  { id: 'T5', label: '5ª aula', inicio: '15:57', fim: '16:45' },
];

export const TODOS_PERIODOS = {};
[...PERIODOS_MANHA, ALMOCO, ...PERIODOS_TARDE].forEach((p) => {
  TODOS_PERIODOS[p.id] = p;
});

export const PERIODO_ORDEM = ['M1', 'M2', 'M3', 'M4', 'M5', 'T1', 'T2', 'T3', 'T4', 'T5'];

// Dias em que cada aula acontece (derivado do horário oficial da escola).
export const GRADE_SEMANA = {
  Segunda: { manha: ['M1', 'M2', 'M3', 'M4', 'M5'], tarde: ['T1', 'T2', 'T3', 'T4', 'T5'] },
  Terça: { manha: ['M1', 'M2', 'M3', 'M4', 'M5'], tarde: ['T1', 'T2', 'T3', 'T4', 'T5'] },
  Quarta: { manha: ['M1', 'M2', 'M3', 'M4', 'M5'], tarde: ['T1', 'T2', 'T3'] },
  Quinta: { manha: ['M1', 'M2', 'M3', 'M4', 'M5'], tarde: ['T1', 'T2', 'T3', 'T4', 'T5'] },
  Sexta: { manha: ['M1', 'M2', 'M3', 'M4'], tarde: [] },
};

export const DIAS_ORDEM = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
export const DIA_JS_MAP = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta' }; // getDay(): 0=Dom

export const KITS = {
  vermelho: { nome: 'Kit Vermelho', cor: '#C1443B', restrito: 'Sala Maker' },
  azul: { nome: 'Kit Azul', cor: '#2C5C8A' },
  amarelo: { nome: 'Kit Amarelo', cor: '#B8860B' },
};

export function diaSemanaDe(dataStr) {
  if (!dataStr) return null;
  const [y, m, d] = dataStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return DIA_JS_MAP[dt.getDay()] || null;
}

export function periodosDoDia(dataStr) {
  const dia = diaSemanaDe(dataStr);
  if (!dia) return { dia: null, ids: [] };
  const g = GRADE_SEMANA[dia];
  return { dia, ids: [...g.manha, ...g.tarde] };
}

export function segundaDaSemanaDe(data) {
  // "YYYY-MM-DD" seria interpretado como UTC por `new Date(string)`, o que
  // desloca o dia local em fusos atrás de UTC (ex.: Brasília) — por isso
  // strings são quebradas em y/m/d manualmente, como em diaSemanaDe().
  const d =
    typeof data === 'string'
      ? (() => {
          const [y, m, dia] = data.split('-').map(Number);
          return new Date(y, m - 1, dia);
        })()
      : new Date(data);
  const diaSemana = d.getDay(); // 0=Dom ... 6=Sáb
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + diff);
  return d;
}

export function toISO(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
