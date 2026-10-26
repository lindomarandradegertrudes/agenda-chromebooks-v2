import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  KITS,
  TODOS_PERIODOS,
  PERIODO_ORDEM,
  DIAS_ORDEM,
  GRADE_SEMANA,
  segundaDaSemanaDe,
  diaSemanaDe,
  toISO,
  turnoDoPeriodo,
} from '../lib/schedule-config';
import { listarReservasNoIntervalo, listarBloqueiosNoIntervalo } from '../lib/firestore-api';
import { fmtDataBR, toISODate, diaSemanaCompleto } from '../lib/format';

const NOME_ESCOLA = 'Escola Agrícola Municipal Carlos Heins Funke';
const KIT_IDS = Object.keys(KITS);

// Medidas da folha (A4 paisagem, margem de 8 mm — ver @page em index.css).
// A tabela de cada kit tem altura fixa; se o conteúdo não couber, a fonte
// daquele kit é reduzida até caber (ver ajustarAoPapel).
const ALTURA_TABELA_MM = 166;
const PX_POR_MM = 96 / 25.4;
const ESCALA_MINIMA = 0.5;

function diaTemPeriodo(dia, periodoId) {
  const g = GRADE_SEMANA[dia];
  return g.manha.includes(periodoId) || g.tarde.includes(periodoId);
}

function ajustarAoPapel(raiz) {
  const alvo = ALTURA_TABELA_MM * PX_POR_MM;
  raiz.querySelectorAll('.folha-kit').forEach((secao) => {
    const tabela = secao.querySelector('.folha-tabela');
    let escala = 1;
    secao.style.setProperty('--escala', String(escala));
    while (tabela.offsetHeight > alvo + 1 && escala > ESCALA_MINIMA) {
      escala = Math.round((escala - 0.05) * 100) / 100;
      secao.style.setProperty('--escala', String(escala));
    }
  });
}

export default function ImprimirPlanilha() {
  const [dataReferencia, setDataReferencia] = useState(toISO(new Date()));
  const [reservas, setReservas] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const folhaRef = useRef(null);

  const dias = useMemo(() => {
    if (!dataReferencia) return [];
    const segunda = segundaDaSemanaDe(dataReferencia);
    return DIAS_ORDEM.map((nome, i) => {
      const d = new Date(segunda);
      d.setDate(segunda.getDate() + i);
      return { nome, data: toISO(d) };
    });
  }, [dataReferencia]);

  useEffect(() => {
    if (dias.length === 0) return;
    let cancelado = false;
    setCarregando(true);
    setErro('');
    Promise.all([
      listarReservasNoIntervalo(dias[0].data, dias[dias.length - 1].data),
      listarBloqueiosNoIntervalo(dias[0].data, dias[dias.length - 1].data),
    ])
      .then(([r, b]) => {
        if (cancelado) return;
        setReservas(r.map((x) => ({ ...x, data: toISODate(x.data) || x.data })));
        setBloqueios(b.map((x) => ({ ...x, data: toISODate(x.data) || x.data })));
      })
      .catch(() => {
        if (!cancelado) setErro('Não foi possível carregar a agenda da semana. Tente novamente.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [dias]);

  // A folha existe fora da tela (ver #folha-impressao em index.css) já com as
  // medidas do papel, então dá pra medir o conteúdo e reduzir a fonte antes
  // mesmo de o gestor clicar em imprimir.
  useLayoutEffect(() => {
    if (!carregando && folhaRef.current) ajustarAoPapel(folhaRef.current);
  }, [carregando, reservas, bloqueios, dias]);

  function imprimir() {
    if (folhaRef.current) ajustarAoPapel(folhaRef.current);
    // O título da aba vira o nome sugerido do PDF ao "Salvar como PDF".
    const tituloOriginal = document.title;
    const inicio = dias[0].data.split('-').reverse().join('-');
    const fim = dias[dias.length - 1].data.split('-').reverse().join('-');
    document.title = `Agenda dos Kits Chromebook - ${inicio} a ${fim}`;
    const restaurar = () => {
      document.title = tituloOriginal;
      window.removeEventListener('afterprint', restaurar);
    };
    window.addEventListener('afterprint', restaurar);
    window.print();
  }

  function itensDaCelula(data, periodoId, kitId) {
    const bloqueio = bloqueios.find((b) => b.data === data && b.periodos?.includes(periodoId));
    const doPeriodo = reservas.filter((r) => r.data === data && r.periodoId === periodoId && r.kit === kitId);
    return { bloqueio, reservas: doPeriodo };
  }

  const semanaTexto = dias.length ? `${fmtDataBR(dias[0].data)} a ${fmtDataBR(dias[dias.length - 1].data)}` : '';
  const hojeBR = fmtDataBR(toISO(new Date()));

  const folha = (
    <div id="folha-impressao" ref={folhaRef} aria-hidden="true">
      {KIT_IDS.map((kitId) => (
        <section key={kitId} className={`folha-kit folha-${kitId}`}>
          <header className="folha-faixa">
            <span className="folha-kit-nome">
              {KITS[kitId].nome}
              {KITS[kitId].restrito ? ` — ${KITS[kitId].restrito}` : ''}
            </span>
            <span className="folha-semana">Semana de {semanaTexto}</span>
          </header>

          <table className="folha-tabela">
            <colgroup>
              <col className="folha-col-periodo" />
              {dias.map((d) => (
                <col key={d.data} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Período</th>
                {dias.map((d) => (
                  <th key={d.data}>
                    {d.nome}
                    <span className="folha-data">{fmtDataBR(d.data).slice(0, 5)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODO_ORDEM.map((periodoId) => {
                const p = TODOS_PERIODOS[periodoId];
                return (
                  <tr key={periodoId} className={periodoId === 'T1' ? 'folha-divisor' : ''}>
                    <th className="folha-rotulo">
                      {p.label} ({turnoDoPeriodo(periodoId)})
                      <span className="folha-horario">
                        {p.inicio}–{p.fim}
                      </span>
                    </th>
                    {dias.map((d) => {
                      if (!diaTemPeriodo(d.nome, periodoId)) {
                        return (
                          <td key={d.data} className="folha-nao-letivo">
                            —
                          </td>
                        );
                      }
                      const { bloqueio, reservas: doPeriodo } = itensDaCelula(d.data, periodoId, kitId);
                      return (
                        <td key={d.data}>
                          {bloqueio && <div className="folha-bloqueio">Bloqueado — {bloqueio.motivo || 'sem motivo'}</div>}
                          {doPeriodo.map((r) => (
                            <div key={r.id} className="folha-reserva">
                              <strong>{r.local}</strong>
                              <span>
                                {r.professorNome}
                                {r.professorArea ? ` (${r.professorArea})` : ''}
                              </span>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <footer className="folha-rodape">
            <span>{NOME_ESCOLA}</span>
            <span>Impresso em {hojeBR}</span>
          </footer>
        </section>
      ))}
    </div>
  );

  return (
    <div className="card">
      <h3>Imprimir planilha</h3>
      <p className="muted">
        Imprime a agenda da semana em A4 paisagem, uma página por kit (Vermelho, Azul e Amarelo), com os horários
        livres em branco para preencher à mão. Na janela de impressão, também dá para salvar como PDF.
      </p>
      <label>
        Semana que contém a data
        <span className="data-com-dia">
          <input type="date" value={dataReferencia} onChange={(e) => setDataReferencia(e.target.value)} />
          {dataReferencia && diaSemanaDe(dataReferencia) && (
            <span className="muted">{diaSemanaCompleto(diaSemanaDe(dataReferencia))}</span>
          )}
        </span>
      </label>
      {semanaTexto && <p className="muted">Será impressa a semana de {semanaTexto}.</p>}
      {erro && <p className="form-error">{erro}</p>}
      <button type="button" className="btn btn-primary" disabled={carregando || dias.length === 0} onClick={imprimir}>
        {carregando ? 'Carregando…' : 'Imprimir planilha'}
      </button>
      {createPortal(folha, document.body)}
    </div>
  );
}
