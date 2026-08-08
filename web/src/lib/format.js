export function fmtDataBR(dataISO) {
  const [y, m, d] = dataISO.split('-');
  return `${d}/${m}/${y}`;
}
