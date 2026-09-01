/**
 * Cloud Function agendada — Agenda dos Kits Chromebook
 * Escola Agrícola Municipal Carlos Heins Funke
 *
 * Roda sozinha toda sexta-feira ao meio-dia (horário de Brasília):
 *   - escreve a agenda completa da semana seguinte (uma tabela por kit) num
 *     Google Doc fixo, sempre sobrescrevendo o conteúdo anterior;
 *   - manda o link desse Doc por e-mail para cada gestor(a) cadastrado(a).
 *
 * Não manda mais e-mail individual por professor nem atualiza planilha.
 *
 * Nenhuma ação manual é necessária depois do deploy — os dados vêm direto
 * do Firestore, que é alimentado pelo próprio app conforme os professores
 * agendam.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { defineSecret, defineString } = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

initializeApp();
const db = getFirestore();

// Configurados via `firebase functions:secrets:set EMAIL_USER` / `EMAIL_PASS`
// (veja PROJECT_SPEC.md). Use uma "senha de app" do Gmail, não a senha normal.
const EMAIL_USER = defineSecret('EMAIL_USER');
const EMAIL_PASS = defineSecret('EMAIL_PASS');

// Código de acesso da área do gestor — validado só aqui no servidor, nunca
// enviado ao navegador (diferente do antigo VITE_GESTOR_CODE, que ficava
// visível no bundle JS do site). Configurar com
// `firebase functions:secrets:set GESTOR_CODE`.
const GESTOR_CODE = defineSecret('GESTOR_CODE');

// ID do Google Doc que recebe a agenda semanal (a parte entre /d/ e /edit na
// URL do documento). Crie um Google Doc, compartilhe com o e-mail da conta de
// serviço das Cloud Functions dando permissão de *Editor*, e coloque o ID em
// functions/.env.<project-id> (ver functions/.env.example). Não é segredo, só
// configuração — o `firebase deploy` carrega esse arquivo automaticamente.
const RELATORIO_DOC_ID = defineString('RELATORIO_DOC_ID');

// Mantenha em sincronia com src/lib/schedule-config.js (é a mesma informação,
// só que copiada aqui porque Cloud Functions não importa código do frontend).
const PERIODO_ORDEM = ['M1', 'M2', 'M3', 'M4', 'M5', 'T1', 'T2', 'T3', 'T4', 'T5'];
const TODOS_PERIODOS = {
  M1: { label: '1ª aula', turno: 'manhã', inicio: '07:15', fim: '08:03' },
  M2: { label: '2ª aula', turno: 'manhã', inicio: '08:03', fim: '08:51' },
  M3: { label: '3ª aula', turno: 'manhã', inicio: '09:06', fim: '09:54' },
  M4: { label: '4ª aula', turno: 'manhã', inicio: '09:54', fim: '10:42' },
  M5: { label: '5ª aula', turno: 'manhã', inicio: '10:42', fim: '11:30' },
  T1: { label: '1ª aula', turno: 'tarde', inicio: '12:30', fim: '13:18' },
  T2: { label: '2ª aula', turno: 'tarde', inicio: '13:18', fim: '14:05' },
  T3: { label: '3ª aula', turno: 'tarde', inicio: '14:05', fim: '14:54' },
  T4: { label: '4ª aula', turno: 'tarde', inicio: '15:09', fim: '15:57' },
  T5: { label: '5ª aula', turno: 'tarde', inicio: '15:57', fim: '16:45' },
};
// Quais aulas existem em cada dia (derivado do horário oficial da escola —
// mantenha em sincronia com GRADE_SEMANA em src/lib/schedule-config.js).
const GRADE_SEMANA = {
  Segunda: ['M1', 'M2', 'M3', 'M4', 'M5', 'T1', 'T2', 'T3', 'T4', 'T5'],
  Terça: ['M1', 'M2', 'M3', 'M4', 'M5', 'T1', 'T2', 'T3', 'T4', 'T5'],
  Quarta: ['M1', 'M2', 'M3', 'M4', 'M5', 'T1', 'T2', 'T3'],
  Quinta: ['M1', 'M2', 'M3', 'M4', 'M5', 'T1', 'T2', 'T3', 'T4', 'T5'],
  Sexta: ['M1', 'M2', 'M3', 'M4'],
};
const DIAS_ORDEM = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const KITS = {
  vermelho: { nome: 'Kit Vermelho' },
  azul: { nome: 'Kit Azul' },
  amarelo: { nome: 'Kit Amarelo' },
};
const NOME_ESCOLA = 'Escola Agrícola Municipal Carlos Heins Funke';
const DIA_JS_MAP = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta' };

// Reserva fixa e recorrente do Kit Vermelho: Segunda a Quinta, 5ª aula da
// manhã e 1ª da tarde, "Projeto Maker" da Ana Lúcia Steinbach. Ver
// garantirReservasProjetoMaker() — cria essas reservas automaticamente,
// sempre mantendo algumas semanas de folga à frente, sem nunca "reviver"
// um dia que tenha sido cancelado manualmente depois de criado.
const PROJETO_MAKER = {
  professorEmail: 'ana.steinbach@edu.joinville.sc.gov.br',
  area: 'Projeto Maker',
  kit: 'vermelho',
  local: 'Sala Maker',
  periodos: ['M5', 'T1'],
  diasUteis: [1, 2, 3, 4], // 1=Segunda .. 4=Quinta (getDay())
  semanasDeFolga: 6,
};

/**
 * Gatilho agendado — roda toda sexta-feira, entre 12h00 e 12h05 (horário de
 * Brasília). Sintaxe de agendamento: https://firebase.google.com/docs/functions/schedule-functions
 */
exports.enviarResumoSemanal = onSchedule(
  {
    schedule: '0 12 * * 5', // sexta-feira, 12:00 (formato cron)
    timeZone: 'America/Sao_Paulo',
    secrets: [EMAIL_USER, EMAIL_PASS],
    region: 'southamerica-east1',
  },
  async () => {
    await executarEnvio();
  }
);

/**
 * Endpoint HTTP opcional para disparar o envio manualmente durante testes,
 * sem precisar esperar sexta-feira. Depois de testar, pode remover este
 * export ou restringir o acesso (veja PROJECT_SPEC.md).
 * Exemplo de uso: abrir a URL da função no navegador.
 */
exports.testarEnvioAgora = onRequest(
  { secrets: [EMAIL_USER, EMAIL_PASS], region: 'southamerica-east1' },
  async (req, res) => {
    const resultado = await executarEnvio();
    res.status(200).send(resultado);
  }
);

/**
 * Valida o código da área do gestor e, se correto, marca a claim
 * `gestor: true` permanentemente na conta Google já logada (via
 * setCustomUserClaims, não um custom token novo — trocar de token trocaria
 * de usuário e perderia a identidade do login com Google). O frontend força
 * um refresh do ID token depois de chamar isso pra claim aparecer.
 */
exports.autenticarGestor = onCall({ secrets: [GESTOR_CODE], region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Você precisa estar logado.');
  }
  const codigo = request.data && request.data.codigo;
  if (!codigo || codigo !== GESTOR_CODE.value()) {
    throw new HttpsError('permission-denied', 'Código incorreto.');
  }
  await getAuth().setCustomUserClaims(request.auth.uid, { gestor: true });
  return { ok: true };
});

/**
 * Diagnóstico SOMENTE-LEITURA do campo `data` da coleção `reservas`.
 * Não altera nada — só lista os documentos cujo `data` não está no formato
 * "AAAA-MM-DD" (Timestamp, Date, string com hora, DD/MM/AAAA etc.), pra
 * decidir a migração com segurança.
 *
 * Uso: abrir a URL da função com ?codigo=<GESTOR_CODE> no navegador.
 */
exports.diagnosticarDatasReservas = onRequest(
  { secrets: [GESTOR_CODE], region: 'southamerica-east1' },
  async (req, res) => {
    if ((req.query.codigo || '') !== GESTOR_CODE.value()) {
      res.status(403).send('Código incorreto. Use ?codigo=<GESTOR_CODE>.');
      return;
    }

    const snap = await db.collection('reservas').get();
    const problemas = [];
    let ok = 0;

    snap.docs.forEach((d) => {
      const data = d.data();
      const valor = data.data;
      const tipo =
        valor && typeof valor === 'object'
          ? valor.constructor && valor.constructor.name
            ? valor.constructor.name
            : 'object'
          : typeof valor;
      const ehStringISO = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);

      if (ehStringISO) {
        ok++;
        return;
      }

      let sugestao = null;
      try {
        if (valor && typeof valor.toDate === 'function') sugestao = toISO(valor.toDate());
        else if (valor instanceof Date) sugestao = toISO(valor);
        else if (typeof valor === 'string') {
          const m = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) || null;
          if (m) sugestao = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        }
      } catch (e) {
        sugestao = `ERRO: ${e.message}`;
      }

      // Reservas do Projeto Maker carregam a data pretendida no próprio
      // grupoId ("projeto-maker-AAAA-MM-DD") — referência confiável.
      let dataDoGrupo = null;
      const g = String(data.grupoId || '').match(/^projeto-maker-(\d{4}-\d{2}-\d{2})$/);
      if (g) dataDoGrupo = g[1];

      problemas.push({
        id: d.id,
        tipo,
        valorBruto: JSON.stringify(valor),
        diaSemana: data.diaSemana || null,
        grupoId: data.grupoId || null,
        sugestaoPeloValor: sugestao,
        sugestaoPeloGrupoId: dataDoGrupo,
      });
    });

    res.status(200).json({
      totalReservas: snap.size,
      comDataOkStringISO: ok,
      comProblema: problemas.length,
      problemas,
    });
  }
);

async function executarEnvio() {
  await garantirReservasProjetoMaker();

  const { inicio, fim } = calcularProximaSemana();

  const [reservasSnap, bloqueiosSnap] = await Promise.all([
    db.collection('reservas').where('data', '>=', inicio).where('data', '<=', fim).get(),
    db.collection('bloqueios').where('data', '>=', inicio).where('data', '<=', fim).get(),
  ]);
  const reservas = reservasSnap.docs.map((d) => d.data());
  const bloqueios = bloqueiosSnap.docs.map((d) => d.data());

  const gestoresSnap = await db.collection('gestores').get();
  const gestores = gestoresSnap.docs.map((d) => d.data()).filter((g) => g.email);

  const linkDoc = await escreverRelatorioNoDoc(reservas, bloqueios, inicio, fim);

  if (gestores.length === 0) {
    const msg = 'Relatório atualizado, mas nenhum gestor com e-mail cadastrado — nada foi enviado.';
    console.log(msg);
    return msg;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER.value(), pass: EMAIL_PASS.value() },
  });

  const enviados = await enviarLinkParaGestores(transporter, gestores, inicio, fim, linkDoc, reservas.length);

  const resumo = `Relatório atualizado (${reservas.length} reserva(s)); link enviado para ${enviados} gestor(es).`;
  console.log(resumo);
  return resumo;
}

/**
 * Cria automaticamente as reservas fixas do "Projeto Maker" (ver
 * PROJETO_MAKER acima), sempre mantendo `semanasDeFolga` semanas de folga a
 * partir de hoje. Usa um documento de controle (`config/projetoMakerHorizonte`)
 * pra nunca reprocessar uma semana já criada — assim, se alguém cancelar um
 * dia específico manualmente (feriado, imprevisto etc.), ele não é recriado
 * sozinho na próxima execução.
 */
async function garantirReservasProjetoMaker() {
  const professora = await buscarProfessorPorEmailAdmin(PROJETO_MAKER.professorEmail);
  if (!professora) {
    console.warn('Projeto Maker: professora não encontrada pelo e-mail cadastrado — pulando criação automática.');
    return 0;
  }

  const hoje = new Date();
  const segundaAtual = segundaDaSemana(hoje);

  const controleRef = db.collection('config').doc('projetoMakerHorizonte');
  const controleSnap = await controleRef.get();
  let segundaBusca = segundaAtual;
  if (controleSnap.exists && controleSnap.data().ultimaSemanaProcessada) {
    const ultima = new Date(controleSnap.data().ultimaSemanaProcessada);
    ultima.setDate(ultima.getDate() + 7);
    if (ultima > segundaBusca) segundaBusca = ultima;
  }

  const segundaLimite = new Date(segundaAtual);
  segundaLimite.setDate(segundaAtual.getDate() + 7 * PROJETO_MAKER.semanasDeFolga);

  let criadas = 0;
  const semana = new Date(segundaBusca);
  while (semana <= segundaLimite) {
    for (const diaJs of PROJETO_MAKER.diasUteis) {
      const dt = new Date(semana);
      dt.setDate(semana.getDate() + (diaJs - 1)); // semana é sempre uma segunda-feira (getDay()===1)
      const dataISO = toISO(dt);
      const diaSemana = DIA_JS_MAP[diaJs];

      const doDiaSnap = await db.collection('reservas').where('data', '==', dataISO).get();
      const doDia = doDiaSnap.docs.map((d) => d.data());

      const batch = db.batch();
      let houveNovo = false;
      for (const periodoId of PROJETO_MAKER.periodos) {
        const jaExiste = doDia.some((r) => r.periodoId === periodoId && r.kit === PROJETO_MAKER.kit);
        if (jaExiste) continue;
        const ref = db.collection('reservas').doc();
        batch.set(ref, {
          data: dataISO,
          diaSemana,
          periodoId,
          kit: PROJETO_MAKER.kit,
          local: PROJETO_MAKER.local,
          professorId: professora.id,
          professorNome: professora.nome,
          professorArea: PROJETO_MAKER.area,
          professorEmail: professora.email,
          grupoId: `projeto-maker-${dataISO}`,
          criadoEm: FieldValue.serverTimestamp(),
        });
        houveNovo = true;
        criadas++;
      }
      if (houveNovo) await batch.commit();
    }
    await controleRef.set({ ultimaSemanaProcessada: toISO(semana) });
    semana.setDate(semana.getDate() + 7);
  }

  if (criadas > 0) console.log(`Projeto Maker: ${criadas} reserva(s) criada(s) automaticamente.`);
  return criadas;
}

async function buscarProfessorPorEmailAdmin(email) {
  const snap = await db.collection('professores').where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

function segundaDaSemana(data) {
  const d = new Date(data);
  const diaSemana = d.getDay();
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Sobrescreve o conteúdo do Google Doc configurado em RELATORIO_DOC_ID com a
 * agenda da semana: um cabeçalho e uma tabela nativa por kit (coluna de
 * horário + uma coluna por dia útil). Só entram as linhas de período que têm
 * alguma reserva ou bloqueio. Se o Doc não foi configurado/compartilhado, só
 * loga um aviso e devolve null — isso nunca impede o envio do e-mail.
 */
async function escreverRelatorioNoDoc(reservas, bloqueios, inicio, fim) {
  const documentId = RELATORIO_DOC_ID.value();
  if (!documentId) {
    console.warn('RELATORIO_DOC_ID não configurado — pulando a escrita do Google Doc.');
    return null;
  }

  const dias = DIAS_ORDEM.map((nome, i) => {
    const dt = new Date(`${inicio}T12:00:00`);
    dt.setDate(dt.getDate() + i);
    return { nome, dataISO: toISO(dt) };
  });

  const tabelas = Object.keys(KITS).map((kitId) => montarTabelaKit(kitId, dias, reservas, bloqueios));

  try {
    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/documents'] });
    const docs = google.docs({ version: 'v1', auth });

    await limparCorpoDoc(docs, documentId);
    await inserirTitulo(
      docs,
      documentId,
      `Agenda dos Kits Chromebook — semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)}`,
      `${NOME_ESCOLA} · atualizado automaticamente em ${fmtDataBR(toISO(new Date()))}`
    );
    for (const tabela of tabelas) {
      await inserirSecaoTabela(docs, documentId, tabela);
    }

    console.log(`Google Doc atualizado com a semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)}.`);
    return `https://docs.google.com/document/d/${documentId}/edit`;
  } catch (err) {
    console.error(
      'Não foi possível atualizar o Google Doc (confira se ele foi compartilhado como Editor com a conta de serviço das Functions):',
      err.message
    );
    return null;
  }
}

/** Monta o modelo (cabeçalho + linhas) da tabela de um kit. */
function montarTabelaKit(kitId, dias, reservas, bloqueios) {
  const porChave = agruparPor(
    reservas.filter((r) => r.kit === kitId),
    (r) => `${r.data}|${r.periodoId}`
  );
  const bloqPorData = agruparPor(bloqueios, (b) => b.data);
  const bloqueioNa = (dataISO, periodoId) =>
    (bloqPorData[dataISO] || []).find((b) => Array.isArray(b.periodos) && b.periodos.includes(periodoId));

  const header = ['Horário', ...dias.map((d) => `${d.nome}\n${fmtDataBR(d.dataISO).slice(0, 5)}`)];
  const linhas = [];

  for (const periodoId of PERIODO_ORDEM) {
    const p = TODOS_PERIODOS[periodoId];
    const temAlgo = dias.some(
      (d) =>
        GRADE_SEMANA[d.nome].includes(periodoId) &&
        (bloqueioNa(d.dataISO, periodoId) || (porChave[`${d.dataISO}|${periodoId}`] || []).length > 0)
    );
    if (!temAlgo) continue;

    const celulas = [`${p.label} (${p.turno})\n${p.inicio}–${p.fim}`];
    for (const d of dias) {
      if (!GRADE_SEMANA[d.nome].includes(periodoId)) {
        celulas.push('—');
        continue;
      }
      const bloq = bloqueioNa(d.dataISO, periodoId);
      if (bloq) {
        celulas.push(`Bloqueado — ${bloq.motivo || 'sem motivo'}`);
        continue;
      }
      const rs = porChave[`${d.dataISO}|${periodoId}`] || [];
      if (rs.length === 0) {
        celulas.push('livre');
        continue;
      }
      celulas.push(
        rs
          .map(
            (r) =>
              `${r.local || '—'} — ${r.professorNome || 'professor não identificado'}` +
              (r.professorArea ? ` (${r.professorArea})` : '')
          )
          .join('\n')
      );
    }
    linhas.push(celulas);
  }

  return { titulo: (KITS[kitId] || { nome: kitId }).nome, header, linhas };
}

/** Apaga tudo do corpo do Doc, deixando só o parágrafo final obrigatório. */
async function limparCorpoDoc(docs, documentId) {
  const { data } = await docs.documents.get({ documentId });
  const content = data.body.content || [];
  const fim = content.length ? content[content.length - 1].endIndex : 1;
  if (fim > 2) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: [{ deleteContentRange: { range: { startIndex: 1, endIndex: fim - 1 } } }] },
    });
  }
}

/** Índice válido de inserção no fim do corpo (antes do \n final). */
async function fimDoDoc(docs, documentId) {
  const { data } = await docs.documents.get({ documentId });
  const content = data.body.content || [];
  return (content.length ? content[content.length - 1].endIndex : 2) - 1;
}

async function inserirTitulo(docs, documentId, titulo, subtitulo) {
  const texto = `${titulo}\n${subtitulo}\n`;
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        { insertText: { location: { index: 1 }, text: texto } },
        {
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: 1 + titulo.length + 1 },
            paragraphStyle: { namedStyleType: 'HEADING_1' },
            fields: 'namedStyleType',
          },
        },
        {
          updateParagraphStyle: {
            range: { startIndex: 1 + titulo.length + 1, endIndex: 1 + texto.length },
            paragraphStyle: { namedStyleType: 'SUBTITLE' },
            fields: 'namedStyleType',
          },
        },
      ],
    },
  });
}

/** Insere o nome do kit (Heading 2) + a tabela preenchida no fim do Doc. */
async function inserirSecaoTabela(docs, documentId, tabela) {
  const nColunas = tabela.header.length;
  const nLinhas = tabela.linhas.length + 1;
  const nome = tabela.titulo;

  let idx = await fimDoDoc(docs, documentId);
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        { insertText: { location: { index: idx }, text: `${nome}\n` } },
        {
          updateParagraphStyle: {
            range: { startIndex: idx, endIndex: idx + nome.length + 1 },
            paragraphStyle: { namedStyleType: 'HEADING_2' },
            fields: 'namedStyleType',
          },
        },
      ],
    },
  });

  idx = await fimDoDoc(docs, documentId);
  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests: [{ insertTable: { rows: nLinhas, columns: nColunas, location: { index: idx } } }] },
  });

  // Preenche as células. As posições são lidas do Doc já com a tabela vazia e
  // o texto é inserido de trás pra frente, pra uma inserção não deslocar o
  // índice das células ainda não preenchidas.
  const valores = [...tabela.header, ...tabela.linhas.flat()];
  const { data } = await docs.documents.get({ documentId });
  const tabelaEl = [...(data.body.content || [])].reverse().find((el) => el.table);
  if (!tabelaEl) throw new Error('tabela recém-inserida não encontrada no Doc');

  const inicios = [];
  tabelaEl.table.tableRows.forEach((row) => {
    row.tableCells.forEach((cell) => inicios.push(cell.content[0].startIndex));
  });

  const requests = inicios
    .map((startIndex, i) => ({ startIndex, text: valores[i] || '' }))
    .filter((par) => par.text)
    .sort((a, b) => b.startIndex - a.startIndex)
    .map((par) => ({ insertText: { location: { index: par.startIndex }, text: par.text } }));

  if (requests.length) {
    await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  }
}

function calcularProximaSemana() {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=Dom
  const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segundaAtual = new Date(hoje);
  segundaAtual.setDate(hoje.getDate() + diffSegunda);

  const segundaSeguinte = new Date(segundaAtual);
  segundaSeguinte.setDate(segundaAtual.getDate() + 7);
  const sextaSeguinte = new Date(segundaSeguinte);
  sextaSeguinte.setDate(segundaSeguinte.getDate() + 4);

  return { inicio: toISO(segundaSeguinte), fim: toISO(sextaSeguinte) };
}

function toISO(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function enviarLinkParaGestores(transporter, gestores, inicio, fim, linkDoc, totalReservas) {
  const assunto = `Agenda de Chromebooks — semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)}`;
  const corpo = [
    `A agenda completa dos kits para a semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)} foi atualizada.`,
    '',
    totalReservas === 0
      ? 'Nenhuma reserva registrada para esta semana até o momento.'
      : `${totalReservas} reserva(s) registrada(s).`,
    '',
    linkDoc
      ? `Ver no Google Doc: ${linkDoc}`
      : '(Não foi possível gerar o link do Google Doc nesta execução — verifique os logs da função.)',
    '',
    '—',
    NOME_ESCOLA,
  ].join('\n');

  let enviados = 0;
  for (const g of gestores) {
    await transporter.sendMail({ from: EMAIL_USER.value(), to: g.email, subject: assunto, text: corpo });
    enviados++;
  }
  return enviados;
}

function agruparPor(lista, chaveFn) {
  const grupos = {};
  lista.forEach((item) => {
    const chave = chaveFn(item);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(item);
  });
  return grupos;
}

// Tolerante a valores fora do formato "AAAA-MM-DD" (Timestamp já convertido,
// string com hora etc.) — devolve o que der ou o valor original como texto.
function fmtDataBR(valor) {
  if (valor && typeof valor.toDate === 'function') valor = toISO(valor.toDate());
  else if (valor instanceof Date) valor = toISO(valor);
  const s = String(valor || '');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return s;
  return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`;
}
