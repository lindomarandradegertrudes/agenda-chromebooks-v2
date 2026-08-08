import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KITS,
  TODOS_PERIODOS,
  PERIODO_ORDEM,
  periodosDoDia,
  segundaDaSemanaDe,
  toISO,
} from '../lib/schedule-config';
import {
  listarProfessores,
  listarReservasDaData,
  listarBloqueiosDaData,
  criarReservas,
  listarReservasDoProfessor,
  cancelarGrupo,
} from '../lib/firestore-api';
import { fmtDataBR } from '../lib/format';
import ConfirmInline from '../components/ConfirmInline';

const KIT_IDS = Object.keys(KITS);

function calcularLimites() {
  const hoje = new Date();
  const segundaAtual = segundaDaSemanaDe(hoje);
  const sextaSeguinte = new Date(segundaAtual);
  sextaSeguinte.setDate(segundaAtual.getDate() + 11); // +7 (próxima semana) +4 (sexta)
  return { min: toISO(segundaAtual), max: toISO(sextaSeguinte) };
}

export default function Agendar() {
  const { min, max } = useMemo(calcularLimites, []);

  const [professores, setProfessores] = useState([]);
  const [professorId, setProfessorId] = useState('');
  const [data, setData] = useState('');
  const [kit, setKit] = useState('vermelho');
  const [local, setLocal] = useState('');
  const [periodosSelecionados, setPeriodosSelecionados] = useState(new Set());

  const [reservasDoDia, setReservasDoDia] = useState([]);
  const [bloqueiosDoDia, setBloqueiosDoDia] = useState([]);
  const [carregandoDia, setCarregandoDia] = useState(false);

  const [meusAgendamentos, setMeusAgendamentos] = useState([]);
  const [carregandoMeus, setCarregandoMeus] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    listarProfessores().then(setProfessores);
  }, []);

  useEffect(() => {
    if (!data) {
      setReservasDoDia([]);
      setBloqueiosDoDia([]);
      return;
    }
    setCarregandoDia(true);
    setPeriodosSelecionados(new Set());
    Promise.all([listarReservasDaData(data), listarBloqueiosDaData(data)])
      .then(([reservas, bloqueios]) => {
        setReservasDoDia(reservas);
        setBloqueiosDoDia(bloqueios);
      })
      .finally(() => setCarregandoDia(false));
  }, [data]);

  useEffect(() => {
    setPeriodosSelecionados(new Set());
  }, [kit]);

  const carregarMeusAgendamentos = useCallback(
    async (id) => {
      if (!id) {
        setMeusAgendamentos([]);
        return;
      }
      setCarregandoMeus(true);
      try {
        const todas = await listarReservasDoProfessor(id);
        const daSemanaAtualEmDiante = todas.filter((r) => r.data >= min);
        const grupos = new Map();
        daSemanaAtualEmDiante.forEach((r) => {
          if (!grupos.has(r.grupoId)) grupos.set(r.grupoId, []);
          grupos.get(r.grupoId).push(r);
        });
        const lista = [...grupos.entries()]
          .map(([grupoId, itens]) => ({
            grupoId,
            itens: itens.sort((a, b) => PERIODO_ORDEM.indexOf(a.periodoId) - PERIODO_ORDEM.indexOf(b.periodoId)),
          }))
          .sort((a, b) => a.itens[0].data.localeCompare(b.itens[0].data));
        setMeusAgendamentos(lista);
      } finally {
        setCarregandoMeus(false);
      }
    },
    [min]
  );

  useEffect(() => {
    carregarMeusAgendamentos(professorId);
  }, [professorId, carregarMeusAgendamentos]);

  const { dia: diaSemana, ids: periodosDoDiaIds } = data ? periodosDoDia(data) : { dia: null, ids: [] };

  function statusDoPeriodo(periodoId) {
    if (bloqueiosDoDia.some((b) => b.periodos?.includes(periodoId))) return 'bloqueado';
    if (reservasDoDia.some((r) => r.periodoId === periodoId && r.kit === kit)) return 'reservado';
    return 'livre';
  }

  function togglePeriodo(periodoId) {
    if (statusDoPeriodo(periodoId) !== 'livre') return;
    setPeriodosSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(periodoId)) next.delete(periodoId);
      else next.add(periodoId);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setMensagem('');

    const professor = professores.find((p) => p.id === professorId);
    if (!professor) {
      setErro('Escolha um(a) professor(a).');
      return;
    }
    if (!data) {
      setErro('Escolha uma data.');
      return;
    }
    const localFinal = kit === 'vermelho' ? KITS.vermelho.restrito : local.trim();
    if (!localFinal) {
      setErro('Informe o local (sala/turma).');
      return;
    }
    if (periodosSelecionados.size === 0) {
      setErro('Selecione ao menos um período.');
      return;
    }

    setEnviando(true);
    try {
      const grupoId = crypto.randomUUID();
      const itens = [...periodosSelecionados].map((periodoId) => ({
        data,
        diaSemana,
        periodoId,
        kit,
        local: localFinal,
        professorId: professor.id,
        professorNome: professor.nome,
        professorArea: professor.area,
        professorEmail: professor.email || '',
        grupoId,
      }));
      await criarReservas(itens);
      setMensagem('Agendamento confirmado!');
      setPeriodosSelecionados(new Set());
      setLocal('');
      const [reservas, bloqueios] = await Promise.all([listarReservasDaData(data), listarBloqueiosDaData(data)]);
      setReservasDoDia(reservas);
      setBloqueiosDoDia(bloqueios);
      await carregarMeusAgendamentos(professorId);
    } catch {
      setErro('Não foi possível agendar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleCancelarGrupo(grupoId) {
    await cancelarGrupo(grupoId);
    await carregarMeusAgendamentos(professorId);
    if (data) {
      const [reservas, bloqueios] = await Promise.all([listarReservasDaData(data), listarBloqueiosDaData(data)]);
      setReservasDoDia(reservas);
      setBloqueiosDoDia(bloqueios);
    }
  }

  return (
    <section className="screen">
      <h2>Agendar</h2>

      <form className="card form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Professor(a)
            <select value={professorId} onChange={(e) => setProfessorId(e.target.value)}>
              <option value="">Selecione…</option>
              {professores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>

          <label>
            Data
            <input type="date" min={min} max={max} value={data} onChange={(e) => setData(e.target.value)} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Kit
            <div className="kit-picker">
              {KIT_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`kit-btn kit-${id}${kit === id ? ' active' : ''}`}
                  onClick={() => setKit(id)}
                >
                  {KITS[id].nome}
                </button>
              ))}
            </div>
          </label>

          <label>
            Local
            {kit === 'vermelho' ? (
              <input value={KITS.vermelho.restrito} disabled />
            ) : (
              <input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex.: Sala 12 / Turma 8ºA"
              />
            )}
          </label>
        </div>

        {data ? (
          <div className="periodos-picker">
            <p className="field-label">
              Períodos — {diaSemana}, {fmtDataBR(data)}
            </p>
            {carregandoDia ? (
              <p className="muted">Carregando…</p>
            ) : (
              <div className="periodos-grid">
                {periodosDoDiaIds.map((id) => {
                  const p = TODOS_PERIODOS[id];
                  const status = statusDoPeriodo(id);
                  const selecionado = periodosSelecionados.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`periodo-chip status-${status}${selecionado ? ' selected' : ''}`}
                      disabled={status !== 'livre'}
                      onClick={() => togglePeriodo(id)}
                      title={status === 'bloqueado' ? 'Período bloqueado' : status === 'reservado' ? 'Já reservado' : ''}
                    >
                      <span className="periodo-label">{p.label}</span>
                      <span className="periodo-horario">
                        {p.inicio}–{p.fim}
                      </span>
                      <span className="periodo-status">
                        {status === 'livre' ? 'Livre' : status === 'reservado' ? 'Reservado' : 'Bloqueado'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="muted">Escolha uma data para ver os períodos disponíveis.</p>
        )}

        {erro && <p className="form-error">{erro}</p>}
        {mensagem && <p className="form-success">{mensagem}</p>}

        <button type="submit" className="btn btn-primary" disabled={enviando}>
          {enviando ? 'Agendando…' : 'Confirmar agendamento'}
        </button>
      </form>

      {professorId && (
        <div className="card">
          <h3>Meus agendamentos</h3>
          {carregandoMeus ? (
            <p className="muted">Carregando…</p>
          ) : meusAgendamentos.length === 0 ? (
            <p className="muted">Nenhum agendamento a partir desta semana.</p>
          ) : (
            <ul className="agendamentos-list">
              {meusAgendamentos.map(({ grupoId, itens }) => {
                const primeiro = itens[0];
                return (
                  <li key={grupoId} className="agendamento-item">
                    <div>
                      <strong>
                        {primeiro.diaSemana}, {fmtDataBR(primeiro.data)}
                      </strong>
                      <span className={`kit-badge kit-${primeiro.kit}`}>{KITS[primeiro.kit]?.nome}</span>
                      <span className="muted"> · {primeiro.local}</span>
                      <div className="periodo-tags">
                        {itens.map((i) => (
                          <span key={i.id} className="periodo-tag">
                            {TODOS_PERIODOS[i.periodoId]?.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ConfirmInline onConfirm={() => handleCancelarGrupo(grupoId)} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
