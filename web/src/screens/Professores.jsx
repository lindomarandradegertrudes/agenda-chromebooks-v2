import { useEffect, useState } from 'react';
import { listarProfessores, criarProfessor } from '../lib/firestore-api';

export default function Professores() {
  const [professores, setProfessores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [area, setArea] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    try {
      setProfessores(await listarProfessores());
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
    if (!nome.trim() || !area.trim()) {
      setErro('Preencha nome e matéria.');
      return;
    }
    setSalvando(true);
    try {
      await criarProfessor({ nome: nome.trim(), area: area.trim(), email: email.trim() });
      setNome('');
      setArea('');
      setEmail('');
      await carregar();
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="screen">
      <h2>Professores</h2>

      <form className="card form" onSubmit={handleSubmit}>
        <h3>Cadastrar professor(a)</h3>
        <div className="form-row">
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
          </label>
          <label>
            Matéria
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Matemática" />
          </label>
          <label>
            E-mail (opcional)
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
          {salvando ? 'Salvando…' : 'Cadastrar'}
        </button>
      </form>

      <div className="card">
        <h3>Professores cadastrados</h3>
        {carregando ? (
          <p className="muted">Carregando…</p>
        ) : professores.length === 0 ? (
          <p className="muted">Nenhum professor cadastrado ainda.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Matéria</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {professores.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td>{p.area}</td>
                  <td>{p.email || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
