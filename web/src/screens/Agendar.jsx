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
  listarReservasDaData,
  listarBloqueiosDaData,
  criarReservas,
  listarReservasDoProfessor,
  cancelarGrupo,
  buscarProfessorPorEmail,
  criarProfessor,
} from '../lib/firestore-api';
import { fmtDataBR } from '../lib/format';
import ConfirmInline from '../components/ConfirmInline';

const KIT_IDS = Object.keys(KITS);

// Fora da última semana do mês: mantém a janela normal de duas semanas
// seguintes à próxima sexta-feira que fecha o prazo — depois que essa sexta
// passa (a partir do sábado), a janela pula pra frente.
//
// Na última semana ISO do mês (a semana, de segunda a domingo, que contém o
// último dia do mês), a agenda do mês seguinte inteiro é liberada, mantendo
// também o restante do mês corrente disponível até essa liberação.
function calcularLimites() {
  const hoje = new Date();

  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const segundaUltimaSemana = segundaDaSemanaDe(ultimoDiaMes);

  if (hoje >= segundaUltimaSemana) {
    const ultimoDiaProxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
    return { min: toISO(hoje), max: toISO(ultimoDiaProxMes) };
  }

  const diaSemana = hoje.getDay(); // 0=Dom .. 6=Sáb
  const passouDaSexta = diaSemana === 0 || diaSemana === 6; // sábado ou domingo
  const segundaAlvo = segundaDaSemanaDe(hoje);
  segundaAlvo.setDate(segundaAlvo.getDate() + (passouDaSexta ? 14 : 7));
  const sextaAlvo = new Date(segundaAlvo);
  sextaAlvo.setDate(segundaAlvo.getDate() + 11); // +11 = sexta da semana seguinte (duas semanas)
  return { min: toISO(segundaAlvo), max: toISO(sextaAlvo) };
}

export default function Agendar({ usuario }) {
  const { min, max } = useMemo(calcularLimites, []);
  const hojeISO = useMemo(() => toISO(new Date()), []);

  const [professor, setProfessor] = useState(undefined); // undefined = verificando, null = sem cadastro
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

  const carregarProfessor = useCallback(async () => {
    setProfessor(await buscarProfessorPorEmail(usuario.email));
  }, [usuario.email]);

  useEffect(() => {
    carregarProfessor();
  }, [carregarProfessor]);

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
    async (professorId) => {
      if (!professorId) {
        setMeusAgendamentos([]);
        return;
      }
      setCarregandoMeus(true);
      try {
        const todas = await listarReservasDoProfessor(professorId);
        const daSemanaAtualEmDiante = todas.filter((r) => r.data >= hojeISO);
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
    [hojeISO]
  );

  useEffect(() => {
    carregarMeusAgendamentos(professor?.id);
  }, [professor, carregarMeusAgendamentos]);

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

    if (!professor) {
      setErro('Complete seu cadastro de professor(a) antes de agendar.');
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
        professorEmail: professor.email,
        grupoId,
      }));
      await criarReservas(itens);
      setMensagem('Agendamento confirmado!');
      setPeriodosSelecionados(new Set());
      setLocal('');
      const [reservas, bloqueios] = await Promise.all([listarReservasDaData(data), listarBloqueiosDaData(data)]);
      setReservasDoDia(reservas);
      setBloqueiosDoDia(bloqueios);
      await carregarMeusAgendamentos(professor.id);
    } catch {
      setErro('Não foi possível agendar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleCancelarGrupo(grupoId) {
    await cancelarGrupo(grupoId);
    await carregarMeusAgendamentos(professor?.id);
    if (data) {
      const [reservas, bloqueios] = await Promise.all([listarReservasDaData(data), listarBloqueiosDaData(data)]);
      setReservasDoDia(reservas);
      setBloqueiosDoDia(bloqueios);
    }
  }

  if (professor === undefined) {
    return (
      <section className="screen">
        <h2>Agendar</h2>
        <p className="muted">Carregando…</p>
      </section>
    );
  }

  if (professor === null) {
    return (
      <section className="screen">
        <h2>Agendar</h2>
        <CompletarCadastro usuario={usuario} onCadastrado={carregarProfessor} />
      </section>
    );
  }

  return (
    <section className="screen">
      <h2>Agendar</h2>

      <form className="card form" onSubmit={handleSubmit}>
        <p className="muted">
          Agendando como <strong>{professor.nome}</strong> ({professor.area})
        </p>

        <div className="form-row">
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
    </section>
  );
}

function CompletarCadastro({ usuario, onCadastrado }) {
  const [nome, setNome] = useState(usuario.displayName || '');
  const [area, setArea] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!nome.trim() || !area.trim()) {
      setErro('Preencha nome e matéria.');
      return;
    }
    setSalvando(true);
    try {
      await criarProfessor({ nome: nome.trim(), area: area.trim(), email: usuario.email });
      await onCadastrado();
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <p className="muted">
        Primeiro acesso — complete seu cadastro pra poder agendar (e-mail: {usuario.email}).
      </p>
      <div className="form-row">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
        </label>
        <label>
          Matéria
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Matemática" />
        </label>
      </div>
      {erro && <p className="form-error">{erro}</p>}
      <button type="submit" className="btn btn-primary" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Concluir cadastro'}
      </button>
    </form>
  );
}
