import { useEffect, useState } from 'react';
import { listarProfessores } from '../lib/firestore-api';

// Cadastro de professor(a) agora acontece automaticamente na aba "Agendar"
// no primeiro acesso (e-mail travado na conta Google logada) — aqui só a
// listagem, pra evitar cadastros duplicados/em nome de outra pessoa.
export default function Professores() {
  const [professores, setProfessores] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    listarProfessores()
      .then(setProfessores)
      .finally(() => setCarregando(false));
  }, []);

  return (
    <section className="screen">
      <h2>Professores</h2>

      <div className="card">
        <h3>Professores cadastrados</h3>
        <p className="muted">
          O cadastro é feito automaticamente na aba "Agendar", no primeiro acesso de cada professor(a).
        </p>
        {carregando ? (
          <p className="muted">Carregando…</p>
        ) : professores.length === 0 ? (
          <p className="muted">Nenhum professor cadastrado ainda.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Componente Curricular</th>
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
