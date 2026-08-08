import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import Agendar from './screens/Agendar';
import GradeSemana from './screens/GradeSemana';
import Professores from './screens/Professores';
import Gestor from './screens/Gestor';
import { auth } from './lib/firebase';
import { autenticarAcesso, sair } from './lib/auth';

const ABAS = [
  { id: 'agendar', label: 'Agendar' },
  { id: 'grade', label: 'Grade da semana' },
  { id: 'professores', label: 'Professores' },
  { id: 'gestor', label: 'Área do gestor' },
];

export default function App() {
  const [autenticado, setAutenticado] = useState(null); // null = verificando
  const [aba, setAba] = useState('agendar');

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAutenticado(false);
        return;
      }
      const resultado = await user.getIdTokenResult();
      setAutenticado(resultado.claims.acesso === true);
    });
  }, []);

  if (autenticado === null) {
    return (
      <div className="app-shell">
        <p className="muted" style={{ padding: 24 }}>
          Carregando…
        </p>
      </div>
    );
  }

  if (!autenticado) {
    return <PortaoDeEntrada />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Agenda dos Kits Chromebook</h1>
          <p className="app-subtitle">Escola Agrícola Municipal Carlos Heins Funke</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={sair}>
          Sair
        </button>
      </header>

      <nav className="app-nav">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`app-nav-btn${aba === a.id ? ' active' : ''}`}
            onClick={() => setAba(a.id)}
          >
            {a.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {aba === 'agendar' && <Agendar />}
        {aba === 'grade' && <GradeSemana />}
        {aba === 'professores' && <Professores />}
        {aba === 'gestor' && <Gestor />}
      </main>
    </div>
  );
}

function PortaoDeEntrada() {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setEntrando(true);
    try {
      await autenticarAcesso(codigo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Agenda dos Kits Chromebook</h1>
          <p className="app-subtitle">Escola Agrícola Municipal Carlos Heins Funke</p>
        </div>
      </header>
      <main className="app-main">
        <section className="screen">
          <h2>Acesso restrito</h2>
          <form className="card form gate-form" onSubmit={handleSubmit}>
            <label>
              Código de acesso
              <input
                type="password"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Digite o código"
              />
            </label>
            {erro && <p className="form-error">{erro}</p>}
            <button type="submit" className="btn btn-primary" disabled={entrando}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
