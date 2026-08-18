import { useEffect, useMemo, useState } from 'react';
import {
  KITS,
  TODOS_PERIODOS,
  PERIODO_ORDEM,
  DIAS_ORDEM,
  GRADE_SEMANA,
  segundaDaSemanaDe,
  toISO,
} from '../lib/schedule-config';
import { listarReservasNoIntervalo, listarBloqueiosNoIntervalo } from '../lib/firestore-api';
import { fmtDataBR } from '../lib/format';

function diaTemPeriodo(dia, periodoId) {
  const g = GRADE_SEMANA[dia];
  return g.manha.includes(periodoId) || g.tarde.includes(periodoId);
}

export default function GradeSemana() {
  const [dataReferencia, setDataReferencia] = useState(toISO(new Date()));
  const [reservas, setReservas] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const dias = useMemo(() => {
    const segunda = segundaDaSemanaDe(dataReferencia);
    return DIAS_ORDEM.map((nome, i) => {
      const d = new Date(segunda);
      d.setDate(segunda.getDate() + i);
      return { nome, data: toISO(d) };
    });
  }, [dataReferencia]);

  useEffect(() => {
    if (dias.length === 0) return;
    setCarregando(true);
    const inicio = dias[0].data;
    const fim = dias[dias.length - 1].data;
    Promise.all([listarReservasNoIntervalo(inicio, fim), listarBloqueiosNoIntervalo(inicio, fim)])
      .then(([r, b]) => {
        setReservas(r);
        setBloqueios(b);
      })
      .finally(() => setCarregando(false));
  }, [dias]);

  function itensDaCelula(data, periodoId) {
    const bloqueio = bloqueios.find((b) => b.data === data && b.periodos?.includes(periodoId));
    const doPeriodo = reservas.filter((r) => r.data === data && r.periodoId === periodoId);
    return { bloqueio, reservas: doPeriodo };
  }

  return (
    <section className="screen">
      <h2>Grade da semana</h2>

      <div className="card form">
        <label>
          Ver semana de
          <input type="date" value={dataReferencia} onChange={(e) => setDataReferencia(e.target.value)} />
        </label>
      </div>

      <div className="card grade-wrap">
        {carregando ? (
          <p className="muted">Carregando…</p>
        ) : (
          <table className="grade-table">
            <thead>
              <tr>
                <th>Período</th>
                {dias.map((d) => (
                  <th key={d.data}>
                    {d.nome}
                    <br />
                    <span className="muted">{fmtDataBR(d.data)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODO_ORDEM.map((periodoId) => {
                const p = TODOS_PERIODOS[periodoId];
                return (
                  <tr key={periodoId}>
                    <th className="grade-row-label">
                      {p.label}
                      <br />
                      <span className="muted">
                        {p.inicio}–{p.fim}
                      </span>
                    </th>
                    {dias.map((d) => {
                      if (!diaTemPeriodo(d.nome, periodoId)) {
                        return (
                          <td key={d.data} className="grade-cell nao-letivo">
                            —
                          </td>
                        );
                      }
                      const { bloqueio, reservas: doPeriodo } = itensDaCelula(d.data, periodoId);
                      return (
                        <td key={d.data} className="grade-cell">
                          {bloqueio && (
                            <div className="grade-bloqueio" title={bloqueio.motivo}>
                              Bloqueado — {bloqueio.motivo}
                            </div>
                          )}
                          {doPeriodo.map((r) => (
                            <div key={r.id} className={`grade-reserva kit-${r.kit}`}>
                              <span className={`kit-badge kit-${r.kit}`}>{KITS[r.kit]?.nome}</span>
                              <span>{r.local}</span>
                              <span className="muted">
                                {r.professorNome}
                                {r.professorArea ? ` · ${r.professorArea}` : ''}
                              </span>
                            </div>
                          ))}
                          {!bloqueio && doPeriodo.length === 0 && <span className="muted">Livre</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
