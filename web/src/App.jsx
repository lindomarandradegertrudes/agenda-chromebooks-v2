import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import Agendar from './screens/Agendar';
import GradeSemana from './screens/GradeSemana';
import Professores from './screens/Professores';
import Gestor from './screens/Gestor';
import { auth } from './lib/firebase';
import { entrarComGoogle, processarRetornoLogin, sair, DOMINIO_PERMITIDO } from './lib/auth';

const ABAS = [
  { id: 'agendar', label: 'Agendar' },
  { id: 'grade', label: 'Grade da semana' },
  { id: 'professores', label: 'Professores' },
  { id: 'gestor', label: 'Área do gestor' },
];

function emailPermitido(user) {
  return Boolean(user && user.email && user.email.endsWith(`@${DOMINIO_PERMITIDO}`));
}

export default function App() {
  const [usuario, setUsuario] = useState(null); // undefined = verificando, null = não logado
  const [aba, setAba] = useState('agendar');
  const [erroLogin, setErroLogin] = useState('');

  useEffect(() => {
    processarRetornoLogin().catch((err) => setErroLogin(err.message));
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUsuario(emailPermitido(user) ? user : null);
    });
  }, []);

  if (usuario === undefined) {
    return (
      <div className="app-shell">
        <p className="muted" style={{ padding: 24 }}>
          Carregando…
        </p>
      </div>
    );
  }

  if (!usuario) {
    return <PortaoDeEntrada erroInicial={erroLogin} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Agenda dos Kits Chromebook</h1>
          <p className="app-subtitle">Escola Agrícola Municipal Carlos Heins Funke</p>
        </div>
        <div className="app-header-user">
          <span className="muted">{usuario.email}</span>
          <button type="button" className="btn btn-ghost" onClick={sair}>
            Sair
          </button>
        </div>
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
        {aba === 'agendar' && <Agendar usuario={usuario} />}
        {aba === 'grade' && <GradeSemana />}
        {aba === 'professores' && <Professores />}
        {aba === 'gestor' && <Gestor />}
      </main>
    </div>
  );
}

function PortaoDeEntrada({ erroInicial }) {
  const [erro, setErro] = useState(erroInicial || '');

  async function handleEntrar() {
    setErro('');
    try {
      await entrarComGoogle();
    } catch {
      setErro('Não foi possível entrar. Tente novamente.');
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
          <div className="card gate-form">
            <p className="muted">Entre com sua conta Google institucional da escola (@{DOMINIO_PERMITIDO}).</p>
            {erro && <p className="form-error">{erro}</p>}
            <button type="button" className="btn btn-primary" onClick={handleEntrar}>
              Entrar com Google
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
