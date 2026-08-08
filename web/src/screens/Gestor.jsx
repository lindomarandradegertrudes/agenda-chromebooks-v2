import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { TODOS_PERIODOS, PERIODO_ORDEM, periodosDoDia, toISO, KITS } from '../lib/schedule-config';
import {
  listarReservasDaData,
  cancelarGrupo,
  listarBloqueiosDaData,
  criarBloqueio,
  removerBloqueio,
  listarGestores,
  criarGestor,
} from '../lib/firestore-api';
import { auth } from '../lib/firebase';
import { autenticarGestor } from '../lib/auth';
import ConfirmInline from '../components/ConfirmInline';

export default function Gestor() {
  const [autenticado, setAutenticado] = useState(null); // null = verificando
  const [codigo, setCodigo] = useState('');
  const [erroCodigo, setErroCodigo] = useState('');
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAutenticado(false);
        return;
      }
      const resultado = await user.getIdTokenResult();
      setAutenticado(resultado.claims.gestor === true);
    });
  }, []);

  async function handleEntrar(e) {
    e.preventDefault();
    setErroCodigo('');
    setEntrando(true);
    try {
      await autenticarGestor(codigo);
    } catch (err) {
      setErroCodigo(err.message);
    } finally {
      setEntrando(false);
    }
  }

  if (autenticado === null) {
    return (
      <section className="screen">
        <h2>Área do gestor</h2>
        <p className="muted">Verificando acesso…</p>
      </section>
    );
  }

  if (!autenticado) {
    return (
      <section className="screen">
        <h2>Área do gestor</h2>
        <form className="card form gate-form" onSubmit={handleEntrar}>
          <label>
            Código de acesso
            <input
              type="password"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Digite o código"
            />
          </label>
          {erroCodigo && <p className="form-error">{erroCodigo}</p>}
          <button type="submit" className="btn btn-primary" disabled={entrando}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="screen">
      <h2>Área do gestor</h2>
      <GerenciarReservas />
      <BloquearPeriodo />
      <Gestores />
    </section>
  );
}

function GerenciarReservas() {
  const [data, setData] = useState(toISO(new Date()));
  const [reservas, setReservas] = useState([]);
  const [carregando, setCarregando] = useState(false);

  async function carregar(d) {
    setCarregando(true);
    try {
      setReservas(await listarReservasDaData(d));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(data);
  }, [data]);

  const grupos = new Map();
  reservas.forEach((r) => {
    if (!grupos.has(r.grupoId)) grupos.set(r.grupoId, []);
    grupos.get(r.grupoId).push(r);
  });
  grupos.forEach((itens) => itens.sort((a, b) => PERIODO_ORDEM.indexOf(a.periodoId) - PERIODO_ORDEM.indexOf(b.periodoId)));

  async function handleCancelar(grupoId) {
    await cancelarGrupo(grupoId);
    await carregar(data);
  }

  return (
    <div className="card">
      <h3>Gerenciar reservas</h3>
      <label>
        Data
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </label>

      {carregando ? (
        <p className="muted">Carregando…</p>
      ) : grupos.size === 0 ? (
        <p className="muted">Nenhuma reserva nesta data.</p>
      ) : (
        <ul className="agendamentos-list">
          {[...grupos.entries()].map(([grupoId, itens]) => {
            const primeiro = itens[0];
            return (
              <li key={grupoId} className="agendamento-item">
                <div>
                  <strong>{primeiro.professorNome}</strong>
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
                <ConfirmInline onConfirm={() => handleCancelar(grupoId)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BloquearPeriodo() {
  const [data, setData] = useState(toISO(new Date()));
  const [periodosSelecionados, setPeriodosSelecionados] = useState(new Set());
  const [motivo, setMotivo] = useState('');
  const [bloqueios, setBloqueios] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar(d) {
    setCarregando(true);
    try {
      setBloqueios(await listarBloqueiosDaData(d));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(data);
    setPeriodosSelecionados(new Set());
  }, [data]);

  const { ids: periodosIds } = data ? periodosDoDia(data) : { ids: [] };

  function togglePeriodo(id) {
    setPeriodosSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (periodosSelecionados.size === 0) {
      setErro('Selecione ao menos um período.');
      return;
    }
    if (!motivo.trim()) {
      setErro('Informe o motivo do bloqueio.');
      return;
    }
    setSalvando(true);
    try {
      await criarBloqueio({ data, periodos: [...periodosSelecionados], motivo: motivo.trim() });
      setPeriodosSelecionados(new Set());
      setMotivo('');
      await carregar(data);
    } catch {
      setErro('Não foi possível bloquear. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleRemover(id) {
    await removerBloqueio(id);
    await carregar(data);
  }

  return (
    <div className="card">
      <h3>Bloquear período</h3>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>

        <div className="periodos-grid">
          {periodosIds.map((id) => {
            const p = TODOS_PERIODOS[id];
            const selecionado = periodosSelecionados.has(id);
            return (
              <button
                key={id}
                type="button"
                className={`periodo-chip status-livre${selecionado ? ' selected' : ''}`}
                onClick={() => togglePeriodo(id)}
              >
                <span className="periodo-label">{p.label}</span>
                <span className="periodo-horario">
                  {p.inicio}–{p.fim}
                </span>
              </button>
            );
          })}
        </div>

        <label>
          Motivo
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: manutenção dos kits" />
        </label>

        {erro && <p className="form-error">{erro}</p>}
        <button type="submit" className="btn btn-primary" disabled={salvando}>
          {salvando ? 'Bloqueando…' : 'Bloquear períodos selecionados'}
        </button>
      </form>

      <h4>Bloqueios nesta data</h4>
      {carregando ? (
        <p className="muted">Carregando…</p>
      ) : bloqueios.length === 0 ? (
        <p className="muted">Nenhum bloqueio nesta data.</p>
      ) : (
        <ul className="agendamentos-list">
          {bloqueios.map((b) => (
            <li key={b.id} className="agendamento-item">
              <div>
                <strong>{b.motivo}</strong>
                <div className="periodo-tags">
                  {b.periodos.map((id) => (
                    <span key={id} className="periodo-tag">
                      {TODOS_PERIODOS[id]?.label}
                    </span>
                  ))}
                </div>
              </div>
              <ConfirmInline label="Remover" confirmLabel="Remover" onConfirm={() => handleRemover(b.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Gestores() {
  const [gestores, setGestores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    try {
      setGestores(await listarGestores());
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!nome.trim() || !email.trim()) {
      setErro('Preencha nome e e-mail.');
      return;
    }
    setSalvando(true);
    try {
      await criarGestor({ nome: nome.trim(), email: email.trim() });
      setNome('');
      setEmail('');
      await carregar();
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card">
      <h3>Gestores</h3>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@escola.gov.br"
            />
          </label>
        </div>
        {erro && <p className="form-error">{erro}</p>}
        <button type="submit" className="btn btn-primary" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Cadastrar gestor(a)'}
        </button>
      </form>

      {carregando ? (
        <p className="muted">Carregando…</p>
      ) : gestores.length === 0 ? (
        <p className="muted">Nenhum gestor cadastrado ainda.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
            </tr>
          </thead>
          <tbody>
            {gestores.map((g) => (
              <tr key={g.id}>
                <td>{g.nome}</td>
                <td>{g.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
