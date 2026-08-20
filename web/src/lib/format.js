export function fmtDataBR(dataISO) {
  const [y, m, d] = dataISO.split('-');
  return `${d}/${m}/${y}`;
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
