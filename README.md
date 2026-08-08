# Agenda dos Kits Chromebook

Site de agendamento dos kits de Chromebook da **Escola Agrícola Municipal Carlos Heins Funke** (Joinville/SC).

Substitui o controle manual por planilha: professores agendam os kits pelo site, e toda sexta-feira ao meio-dia um resumo da semana seguinte é enviado automaticamente por e-mail — sem nenhum passo manual.

## Stack

- **Frontend:** React + Vite ([`web/`](web))
- **Banco de dados:** Firebase Firestore
- **Backend/automação:** Firebase Cloud Functions ([`functions/`](functions))
- **Hospedagem do frontend:** Vercel
- **E-mail:** Nodemailer via Gmail SMTP
- **Planilha semanal:** Google Sheets API

## Funcionalidades

- **Agendar** — escolher professor(a), data (semana atual + próxima), kit (🔴 vermelho / 🔵 azul / 🟡 amarelo) e períodos livres; cancelamento dos próprios agendamentos.
- **Grade da semana** — visão Segunda–Sexta de todos os kits, período por período.
- **Professores** — cadastro e listagem.
- **Área do gestor** — protegida por login (código validado no servidor via Cloud Function + Firebase Auth, não fica exposto no código do site): gerenciar/cancelar qualquer reserva, bloquear períodos, cadastrar gestores.
- **Envio automático** — toda sexta-feira 12h (horário de Brasília), a Cloud Function `enviarResumoSemanal`:
  - manda pra cada professor(a) com e-mail cadastrado só a agenda dele(a);
  - manda pra cada gestor(a) cadastrado(a) a agenda completa;
  - atualiza uma Google Sheet fixa com a semana e inclui o link no e-mail.

## Estrutura

```
firebase-project/
├── web/                  # Frontend React + Vite
│   └── src/
│       ├── screens/      # Agendar, GradeSemana, Professores, Gestor
│       ├── lib/          # Firebase SDK, API do Firestore, regras de horário
│       └── components/   # Componentes compartilhados
├── functions/            # Cloud Functions (envio de e-mail, auth do gestor)
├── firestore.rules       # Regras de segurança do Firestore
├── firestore.indexes.json
└── firebase.json
```

## Rodando localmente

Requer Node 20+ e o [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`).

### Frontend

```bash
cd web
npm install
cp .env.example .env   # preencher com as credenciais do projeto Firebase (ou deixar em branco pra usar o emulador local)
npm run dev
```

Sem credenciais no `.env`, o app conecta automaticamente no [emulador local do Firestore](https://firebase.google.com/docs/emulator-suite) (`firebase emulators:start --only firestore`, requer Java).

### Cloud Functions

```bash
cd functions
npm install
```

Segredos necessários (uma vez, por projeto Firebase):

```bash
firebase functions:secrets:set EMAIL_USER    # Gmail remetente
firebase functions:secrets:set EMAIL_PASS    # senha de app do Gmail
firebase functions:secrets:set GESTOR_CODE   # código de acesso da área do gestor
```

Config não sensível (`SHEET_ID` da Google Sheet semanal) fica em `functions/.env.<project-id>` — veja `functions/.env.example`.

## Deploy

```bash
firebase deploy --only firestore:rules,functions
cd web && vercel --prod
```

As variáveis `VITE_FIREBASE_*` precisam estar configuradas no painel do Vercel (Settings → Environment Variables), com os mesmos valores do `.env` local.

## Segurança

`gestores` e `bloqueios` exigem login validado no servidor (claim `gestor` no Firebase Auth). `professores` (ler/criar) e `reservas` (criar/cancelar) ficam abertos de propósito, para não travar o uso diário — ver `firestore.rules` para os detalhes e trade-offs.

## Licença

Código disponibilizado apenas para consulta. Todos os direitos reservados — veja [LICENSE](LICENSE).
