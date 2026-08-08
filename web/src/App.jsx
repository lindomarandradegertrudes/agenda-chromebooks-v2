import { useState } from 'react';
import Agendar from './screens/Agendar';
import GradeSemana from './screens/GradeSemana';
import Professores from './screens/Professores';
import Gestor from './screens/Gestor';

const ABAS = [
  { id: 'agendar', label: 'Agendar' },
  { id: 'grade', label: 'Grade da semana' },
  { id: 'professores', label: 'Professores' },
  { id: 'gestor', label: 'Área do gestor' },
];

export default function App() {
  const [aba, setAba] = useState('agendar');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Agenda dos Kits Chromebook</h1>
          <p className="app-subtitle">Escola Agrícola Municipal Carlos Heins Funke</p>
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
        {aba === 'agendar' && <Agendar />}
        {aba === 'grade' && <GradeSemana />}
        {aba === 'professores' && <Professores />}
        {aba === 'gestor' && <Gestor />}
      </main>
    </div>
  );
}
