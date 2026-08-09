/**
 * Cloud Function agendada — Agenda dos Kits Chromebook
 * Escola Agrícola Municipal Carlos Heins Funke
 *
 * Roda sozinha toda sexta-feira ao meio-dia (horário de Brasília) e envia:
 *   - para cada professor(a) com e-mail cadastrado: só as reservas dele(a)
 *   - para cada gestor(a) cadastrado(a): a agenda completa da semana seguinte
 *
 * Nenhuma ação manual é necessária depois do deploy — os dados vêm direto
 * do Firestore, que é alimentado pelo próprio app conforme os professores
 * agendam.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
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

// Código de acesso geral ao site (professores/funcionários da escola em
// geral). Configurar com `firebase functions:secrets:set ACESSO_CODE`.
const ACESSO_CODE = defineSecret('ACESSO_CODE');

// ID da Google Sheet que recebe a agenda da semana (a parte entre /d/ e /edit
// na URL da planilha). Crie uma planilha, compartilhe com o e-mail da conta
// de serviço das Cloud Functions (Editor) e cole o ID aqui — o `firebase
// deploy` pergunta o valor na primeira vez. Não é segredo, só configuração.
const SHEET_ID = defineString('SHEET_ID');

// Mantenha em sincronia com src/lib/schedule-config.js (é a mesma informação,
// só que copiada aqui porque Cloud Functions não importa código do frontend).
const PERIODO_ORDEM = ['M1', 'M2', 'M3', 'M4', 'M5', 'T1', 'T2', 'T3', 'T4', 'T5'];
const TODOS_PERIODOS = {
  M1: { inicio: '07:15', fim: '08:03' },
  M2: { inicio: '08:03', fim: '08:51' },
  M3: { inicio: '09:06', fim: '09:54' },
  M4: { inicio: '09:54', fim: '10:42' },
  M5: { inicio: '10:42', fim: '11:30' },
  T1: { inicio: '12:30', fim: '13:18' },
  T2: { inicio: '13:18', fim: '14:05' },
  T3: { inicio: '14:05', fim: '14:54' },
  T4: { inicio: '15:09', fim: '15:57' },
  T5: { inicio: '15:57', fim: '16:45' },
};
const KITS = {
  vermelho: { nome: 'Kit Vermelho' },
  azul: { nome: 'Kit Azul' },
  amarelo: { nome: 'Kit Amarelo' },
};
const NOME_ESCOLA = 'Escola Agrícola Municipal Carlos Heins Funke';

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
 * Valida o código geral de acesso ao site e, se correto, devolve um custom
 * token do Firebase Auth com a claim `acesso: true`. Sem essa claim, as
 * firestore.rules bloqueiam qualquer leitura/escrita — é o portão de entrada
 * do site inteiro, restrito ao pessoal da escola.
 */
exports.autenticarAcesso = onCall({ secrets: [ACESSO_CODE], region: 'southamerica-east1' }, async (request) => {
  const codigo = request.data && request.data.codigo;
  if (!codigo || codigo !== ACESSO_CODE.value()) {
    throw new HttpsError('permission-denied', 'Código incorreto.');
  }
  await garantirClaims('acesso', { acesso: true });
  const token = await getAuth().createCustomToken('acesso', { acesso: true });
  return { token };
});

/**
 * Valida o código da área do gestor e, se correto, devolve um custom token
 * com as claims `acesso: true` e `gestor: true` — a claim `acesso` também
 * vai junto pra logar como gestor não derrubar o acesso geral ao site (o
 * Firebase Auth só mantém uma sessão por vez no navegador).
 */
exports.autenticarGestor = onCall({ secrets: [GESTOR_CODE], region: 'southamerica-east1' }, async (request) => {
  const codigo = request.data && request.data.codigo;
  if (!codigo || codigo !== GESTOR_CODE.value()) {
    throw new HttpsError('permission-denied', 'Código incorreto.');
  }
  await garantirClaims('gestor', { acesso: true, gestor: true });
  const token = await getAuth().createCustomToken('gestor', { acesso: true, gestor: true });
  return { token };
});

/**
 * `createCustomToken(uid, claims)` só embute as claims no primeiro token —
 * quando o navegador renova o login sozinho depois (refresh token, sem
 * passar de novo por essa function), a claim some se não estiver também
 * persistida no registro do usuário via `setCustomUserClaims`. Por isso
 * toda autenticação passa por aqui antes de mintar o token.
 */
async function garantirClaims(uid, claims) {
  try {
    await getAuth().setCustomUserClaims(uid, claims);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await getAuth().createUser({ uid });
      await getAuth().setCustomUserClaims(uid, claims);
    } else {
      throw err;
    }
  }
}

async function executarEnvio() {
  const { inicio, fim } = calcularProximaSemana();

  const reservasSnap = await db
    .collection('reservas')
    .where('data', '>=', inicio)
    .where('data', '<=', fim)
    .get();
  const reservas = reservasSnap.docs.map((d) => d.data());

  if (reservas.length === 0) {
    console.log(`Nenhuma reserva entre ${inicio} e ${fim}. Nada foi enviado.`);
    return `Nenhuma reserva entre ${inicio} e ${fim}. Nada foi enviado.`;
  }

  const gestoresSnap = await db.collection('gestores').get();
  const gestores = gestoresSnap.docs.map((d) => d.data());

  const linkPlanilha = await atualizarPlanilha(reservas, inicio, fim);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER.value(), pass: EMAIL_PASS.value() },
  });

  const enviadosProfessores = await enviarParaProfessores(transporter, reservas, inicio, fim, linkPlanilha);
  const enviadosGestores = await enviarParaGestores(transporter, reservas, gestores, inicio, fim, linkPlanilha);

  const resumo = `Envio concluído: ${enviadosProfessores} e-mail(s) para professores, ${enviadosGestores} para gestores.`;
  console.log(resumo);
  return resumo;
}

/**
 * Sobrescreve a aba "Semana" da Google Sheet configurada em SHEET_ID com a
 * agenda da semana. Se a planilha ainda não foi compartilhada com a conta de
 * serviço (ou SHEET_ID não foi configurado), só loga um aviso e segue sem
 * planilha — isso nunca deve impedir o envio dos e-mails.
 */
async function atualizarPlanilha(reservas, inicio, fim) {
  const sheetId = SHEET_ID.value();
  if (!sheetId) {
    console.log('SHEET_ID não configurado — pulando atualização da planilha.');
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });

    const linhas = [['Data', 'Dia da semana', 'Horário', 'Kit', 'Local', 'Professor(a)']];
    const porData = agruparPor(reservas, (r) => r.data);
    Object.keys(porData)
      .sort()
      .forEach((data) => {
        const doDia = porData[data].sort(
          (a, b) => PERIODO_ORDEM.indexOf(a.periodoId) - PERIODO_ORDEM.indexOf(b.periodoId)
        );
        doDia.forEach((r) => {
          const p = TODOS_PERIODOS[r.periodoId] || {};
          const kit = KITS[r.kit] || { nome: r.kit };
          linhas.push([
            fmtDataBR(data),
            r.diaSemana || '',
            `${p.inicio || ''}-${p.fim || ''}`,
            kit.nome,
            r.local,
            r.professorNome || '',
          ]);
        });
      });

    await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: 'A:F' });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'RAW',
      requestBody: { values: linhas },
    });

    console.log(`Planilha atualizada com a semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)}.`);
    return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  } catch (err) {
    console.error('Não foi possível atualizar a planilha (verifique se ela foi compartilhada com a conta de serviço):', err.message);
    return null;
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

async function enviarParaProfessores(transporter, reservas, inicio, fim, linkPlanilha) {
  const porEmail = agruparPor(
    reservas.filter((r) => r.professorEmail),
    (r) => r.professorEmail
  );
  const emails = Object.keys(porEmail);

  for (const email of emails) {
    const itens = porEmail[email];
    const nome = itens[0].professorNome || 'Professor(a)';
    const assunto = `Sua agenda de Chromebooks — semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)}`;
    const corpo = montarCorpoEmail(
      `Olá, ${nome}! Segue sua agenda de Chromebooks para a semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)}:`,
      itens,
      linkPlanilha
    );
    await transporter.sendMail({ from: EMAIL_USER.value(), to: email, subject: assunto, text: corpo });
  }
  return emails.length;
}

async function enviarParaGestores(transporter, reservas, gestores, inicio, fim, linkPlanilha) {
  const comEmail = gestores.filter((g) => g.email);
  if (comEmail.length === 0) return 0;

  const assunto = `Agenda completa de Chromebooks — semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)}`;
  const corpo = montarCorpoEmail(
    `Agenda completa de todos os kits para a semana de ${fmtDataBR(inicio)} a ${fmtDataBR(fim)}:`,
    reservas,
    linkPlanilha
  );

  for (const g of comEmail) {
    await transporter.sendMail({ from: EMAIL_USER.value(), to: g.email, subject: assunto, text: corpo });
  }
  return comEmail.length;
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

function montarCorpoEmail(introducao, itens, linkPlanilha) {
  const porData = agruparPor(itens, (i) => i.data);
  const datasOrdenadas = Object.keys(porData).sort();

  let texto = introducao + '\n\n';
  datasOrdenadas.forEach((data) => {
    const doDia = porData[data].sort(
      (a, b) => PERIODO_ORDEM.indexOf(a.periodoId) - PERIODO_ORDEM.indexOf(b.periodoId)
    );
    texto += `${doDia[0].diaSemana}, ${fmtDataBR(data)}\n`;
    doDia.forEach((r) => {
      const p = TODOS_PERIODOS[r.periodoId] || {};
      const kit = KITS[r.kit] || { nome: r.kit };
      texto += `  ${p.inicio || ''}-${p.fim || ''} · ${kit.nome} · ${r.local} · ${r.professorNome || 'professor não identificado'}\n`;
    });
    texto += '\n';
  });
  if (linkPlanilha) {
    texto += `Também disponível em planilha: ${linkPlanilha}\n\n`;
  }
  texto += `—\n${NOME_ESCOLA}`;
  return texto;
}

function fmtDataBR(dataISO) {
  const [y, m, d] = dataISO.split('-');
  return `${d}/${m}/${y}`;
}
