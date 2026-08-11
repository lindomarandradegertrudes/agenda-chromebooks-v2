# Agenda dos Kits Chromebook

Site de agendamento dos kits de Chromebook da **Escola Agrícola Municipal Carlos Heins Funke** (Joinville/SC).

🔗 **Site em produção:** https://agenda-chromebooks.vercel.app (acesso restrito a contas Google `@edu.joinville.sc.gov.br`)

Substitui o controle manual por planilha: professores agendam os kits pelo site, e toda sexta-feira ao meio-dia um resumo da semana seguinte é enviado automaticamente por e-mail — sem nenhum passo manual.

## Stack

- **Frontend:** React + Vite ([`web/`](web))
- **Banco de dados:** Firebase Firestore
- **Backend/automação:** Firebase Cloud Functions ([`functions/`](functions))
- **Hospedagem do frontend:** Vercel
- **Autenticação:** Firebase Auth (Google Sign-In restrito ao domínio institucional da escola)
- **E-mail:** Nodemailer via Gmail SMTP
- **Planilha semanal:** Google Sheets API

## Funcionalidades

- **Login** — Google Sign-In restrito a `@edu.joinville.sc.gov.br`; sem senha compartilhada. A identidade logada é amarrada a cada reserva/cadastro (ninguém agenda em nome de outra pessoa).
- **Agendar** — o site já identifica o professor(a) pelo login (cadastro de nome/matéria só na primeira vez); escolher data (próximas duas semanas, fechando na sexta-feira anterior a cada semana — ver `calcularLimites` em `Agendar.jsx`), kit (🔴 vermelho / 🔵 azul / 🟡 amarelo) e períodos livres; cancelamento dos próprios agendamentos.
- **Grade da semana** — visão Segunda–Sexta de todos os kits, período por período.
- **Professores** — listagem (cadastro é automático no primeiro login de cada professor).
- **Área do gestor** — protegida por um segundo código (validado no servidor, nunca exposto no bundle do site): agendar para qualquer professor(a) sem restrição de data, gerenciar/cancelar qualquer reserva, bloquear períodos, cadastrar/remover professores, cadastrar gestores.
- **Envio automático** — toda sexta-feira 12h (horário de Brasília), a Cloud Function `enviarResumoSemanal`:
  - manda pra cada professor(a) com e-mail cadastrado só a agenda dele(a);
  - manda pra cada gestor(a) cadastrado(a) a agenda completa;
  - atualiza uma Google Sheet fixa com a semana e inclui o link no e-mail.

## Estrutura

```
firebase-project/
├── web/                  # Frontend React + Vite
│   ├── vercel.json        # Proxy de /__/auth/* pro Firebase Auth (ver seção Autenticação)
│   └── src/
│       ├── screens/      # Agendar, GradeSemana, Professores, Gestor
│       ├── lib/          # Firebase SDK, API do Firestore, auth, regras de horário
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
cd .. && vercel --prod   # rodar da raiz do repo, não de web/ — ver nota abaixo
```

As variáveis `VITE_FIREBASE_*` precisam estar configuradas no painel do Vercel (Settings → Environment Variables), com os mesmos valores do `.env` local. O projeto do Vercel tem **Root Directory = `web`**, então o CLI deve ser vinculado/rodado a partir da raiz do repositório, não de dentro de `web/`. Depois de um `vercel --prod`, o novo deployment **não** promove automaticamente o domínio `agenda-chromebooks.vercel.app` — rodar também `vercel alias set <url-do-deployment> agenda-chromebooks.vercel.app`.

## Autenticação

O login usa Google Sign-In restrito ao domínio da escola. Como o app roda no Vercel (não no Firebase Hosting), foi preciso resolver um problema conhecido: navegadores atuais (Chrome/Edge) particionam armazenamento entre domínios diferentes, quebrando silenciosamente o fluxo de login entre `agenda-chromebooks.vercel.app` e o `authDomain` padrão do Firebase (`*.firebaseapp.com`). A solução:

1. `web/vercel.json` faz proxy de `/__/auth/*` pro `authDomain` real do Firebase.
2. `VITE_FIREBASE_AUTH_DOMAIN` é configurado como o próprio domínio do site (`agenda-chromebooks.vercel.app`), não o `.firebaseapp.com`.
3. `https://agenda-chromebooks.vercel.app/__/auth/handler` precisa estar na lista de "Authorized redirect URIs" do OAuth Client no [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (senão dá `Erro 400: redirect_uri_mismatch` depois do login).
4. O domínio também precisa estar em Firebase Console → Authentication → Settings → Authorized domains.

Se o domínio do site mudar no futuro, os passos 2–3 precisam ser refeitos.

## Segurança

Todo o site exige login (`request.auth.token.email` termina em `@edu.joinville.sc.gov.br`, checado nas `firestore.rules`). `gestores` e `bloqueios` exigem além disso a claim `gestor: true` (concedida via `setCustomUserClaims` depois de validar o código da área do gestor). `reservas` e `professores` exigem que o e-mail do documento bata com o e-mail de quem está logado (função `ehDono()`), exceto para quem tem a claim de gestor — ver `firestore.rules` para os detalhes.

## Licença

Código disponibilizado apenas para consulta. Todos os direitos reservados — veja [LICENSE](LICENSE).
