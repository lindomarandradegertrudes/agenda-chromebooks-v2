# Agenda dos Kits Chromebook — versão web (Firebase + Vercel)

Escola Agrícola Municipal Carlos Heins Funke — Joinville/SC

> **Nota:** este documento é o plano original que guiou a primeira versão do
> app. O projeto já está em produção e evoluiu bastante desde então — para o
> retrato atualizado de funcionalidades, autenticação e segurança, ver o
> [README.md](README.md). O que segue abaixo foi atualizado nos pontos que
> mudaram de rumo (autenticação, janela de agendamento, Grade da semana,
> Projeto Maker), mas mantém o objetivo original como registro histórico.

## Objetivo

Reconstruir o app de agendamento de Chromebooks (hoje um artefato HTML dentro do Claude) como um site de verdade, publicado, com banco de dados real (Firestore) e envio de e-mail **totalmente automático** toda sexta-feira ao meio-dia — sem nenhum passo manual, ao contrário da versão "planilha Google" que veio antes desta.

Mesma arquitetura já usada com sucesso no dashboard de monitoramento de idas ao banheiro (`bathroom-control.vercel.app`): **React + Firebase + Vercel**.

Este diretório já contém pronto:
- `src/lib/schedule-config.js` — toda a lógica de horários/kits/dias da semana, extraída e validada no protótipo.
- `functions/index.js` — a Cloud Function agendada que envia os e-mails (completa, só falta configurar os secrets e fazer deploy).
- `functions/package.json`, `firebase.json`, `firestore.rules` — configuração do Firebase.

**Status:** o frontend React (`web/`) e o deploy já foram concluídos e o site está em produção — ver o [README.md](README.md) para o estado atual. Este documento descreve o plano original que guiou essa construção.

---

## Stack

- **Frontend:** React + Vite (mais simples de rodar/buildar que Next.js para este caso; sem necessidade de SSR).
- **Banco de dados:** Firebase Firestore.
- **Backend/automação:** Firebase Cloud Functions (já escrita em `functions/index.js`).
- **Hospedagem do frontend:** Vercel.
- **E-mail:** Nodemailer via Gmail SMTP (configurável para outro provedor se preferir).

---

## Modelo de dados (Firestore)

Coleções no nível raiz (sem sub-coleções, sem particionar por mês — o Firestore lida bem com isso via queries, diferente do `window.storage` do artefato que exigia partição manual):

### `professores/{id}`
```
{
  nome: string,
  area: string,       // matéria que leciona
  email: string,       // opcional
  criadoEm: timestamp
}
```

### `gestores/{id}`
```
{
  nome: string,
  email: string,
  criadoEm: timestamp
}
```

### `reservas/{id}`
```
{
  data: string,           // "AAAA-MM-DD"
  diaSemana: string,      // "Segunda".."Sexta"
  periodoId: string,      // "M1".."M5", "T1".."T5" (ver schedule-config.js)
  kit: string,             // "vermelho" | "azul" | "amarelo"
  local: string,           // "Sala Maker" ou a turma/sala informada
  professorId: string,
  professorNome: string,
  professorArea: string,
  professorEmail: string,  // copiado do professor no momento da reserva
  grupoId: string,         // agrupa períodos reservados juntos, p/ cancelamento em bloco
  criadoEm: timestamp
}
```

### `bloqueios/{id}`
```
{
  data: string,            // "AAAA-MM-DD"
  periodos: string[],      // lista de periodoId bloqueados
  motivo: string,
  criadoEm: timestamp
}
```

**Índices:** a Cloud Function faz uma query `where('data', '>=', x).where('data', '<=', y)` na coleção `reservas` — isso é um único campo com range, o Firestore cria o índice automático sozinho, não precisa de `firestore.indexes.json` customizado para isso. Se o Firebase pedir um índice composto ao rodar (aparece um link no erro), é só clicar no link que ele mesmo oferece para criar.

---

## Telas a construir (React)

Portar exatamente o comportamento já validado no protótipo HTML (peça para ver o artefato anterior se precisar conferir algum detalhe visual/de fluxo). Resumo funcional de cada uma:

### 1. Agendar *(implementação final — evoluiu bastante do plano original)*
- O professor(a) não escolhe mais quem está agendando: a identidade vem do login Google (`usuario.email`), com cadastro de nome/Componente Curricular só no primeiro acesso (`CompletarCadastro`).
- Campo de data mostra o dia da semana completo ao lado (ex.: "Segunda-feira"), via `diaSemanaCompleto` em `lib/format.js`.
- Janela de agendamento (`calcularLimites` em `Agendar.jsx`): rolante de duas semanas à frente, sempre fechando na sexta-feira anterior à semana em questão; **além disso**, o mês seguinte inteiro é liberado assim que faltarem 8 dias para ele começar (gatilho fixo, não depende mais de "última segunda-feira do mês").
- Seleção de kit (🔴 vermelho = restrito à "Sala Maker", com campo de turma digitável; 🔵 azul / 🟡 amarelo = campo de local livre).
- Lista de períodos do dia selecionado (via `periodosDoDia`), **separada em dois blocos — Matutino e Vespertino** — com status livre/reservado/bloqueado indicado tanto pelo texto quanto pela cor de fundo do card (verde esmaecido = livre, vermelho esmaecido = ocupado).
- Ao confirmar, cria N documentos em `reservas` (um por período marcado), todos com o mesmo `grupoId`.
- Seção "Meus agendamentos": lista as reservas do professor logado da data atual em diante, agrupadas por `grupoId`, mostrando o turno (manhã/tarde) ao lado do rótulo do período, com botão de cancelar (confirmação inline).

### 2. Grade da semana *(implementação final)*
- Escolher uma data qualquer; mostrar a semana Segunda–Sexta daquela data (via `segundaDaSemanaDe`).
- **Uma tabela separada por kit** (Vermelho, Azul, Amarelo), empilhadas em cascata — não mais uma tabela única com os três kits misturados na mesma célula.
- Células com fundo verde esmaecido (livre) ou vermelho esmaecido (reserva ou bloqueio); reservas do Projeto Maker (ver seção própria abaixo) usam um vermelho ainda mais forte para se diferenciar das reservas comuns.
- Linha divisória espessa entre a última aula da manhã e a primeira da tarde; colunas de Segunda a Sexta com largura fixa e igual (`table-layout: fixed` + `colgroup`).

### 3. Professores
- Cadastro (nome, **Componente Curricular** — renomeado do antigo "Matéria" —, e-mail) e listagem; cadastro/remoção manual também disponível na área do gestor.

### 4. Área do gestor
- Autenticação de verdade via **Google Sign-In** restrito ao domínio `@edu.joinville.sc.gov.br` (ver seção de Segurança, atualizada abaixo) — não é mais um código fixo de acesso geral. Um segundo código, validado no servidor via Cloud Function `autenticarGestor`, libera as ações administrativas.
- **Agendar para professor(a):** sem restrição de janela de data, atribuindo a qualquer professor cadastrado.
- **Gerenciar reservas:** ver/cancelar qualquer reserva de qualquer data.
- **Bloquear período:** bloquear todos os 3 kits num conjunto de períodos de uma data, com motivo obrigatório.
- **Professores:** cadastrar e também **excluir** registros de professores.
- **Gestores:** cadastro de múltiplos gestores (nome + e-mail).
- **Não é mais necessário** o card de "exportar para planilha" nem os botões de `mailto:` da versão anterior — o envio agora é automático via Cloud Function, incluindo a atualização de uma Google Sheet real.

### 5. Projeto Maker *(recurso novo, não previsto no plano original)*
- Reserva recorrente e permanente do Kit Vermelho (Sala Maker), segunda a quinta, 5ª aula da manhã + 1ª aula da tarde, atribuída a Ana Lúcia Steinbach.
- Mantida automaticamente pela Cloud Function `garantirReservasProjetoMaker()` (chamada a cada execução de `enviarResumoSemanal`), gerando reservas reais e canceláveis com um buffer rolante de 6 semanas à frente. Um doc de controle (`config/projetoMakerHorizonte`) garante que um dia cancelado manualmente nunca seja recriado.

---

## Envio automático (já pronto em `functions/index.js`)

A função `enviarResumoSemanal` é um **agendador nativo do Firebase** (`onSchedule`, cron `0 12 * * 5`, fuso `America/Sao_Paulo`) — roda sozinha toda sexta-feira ao meio-dia, sem depender do site estar aberto. Ela:

1. Calcula a semana seguinte (segunda a sexta).
2. Busca em `reservas` tudo dentro desse intervalo.
3. Agrupa por `professorEmail` e manda um e-mail individual por professor(a) com e-mail cadastrado.
4. Busca todos os `gestores` e manda pra cada um a agenda completa da semana.

Também inclui `testarEnvioAgora`, uma função HTTP para disparar o envio manualmente durante os testes (sem esperar sexta-feira chegar).

### Configurar as credenciais de e-mail (uma vez, antes do primeiro deploy)

```bash
firebase functions:secrets:set EMAIL_USER
firebase functions:secrets:set EMAIL_PASS
```

- `EMAIL_USER`: o endereço Gmail que vai aparecer como remetente.
- `EMAIL_PASS`: uma **senha de app** do Gmail (não a senha normal da conta) — gerar em [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), exige verificação em duas etapas ativada na conta.

Se preferir não usar Gmail, trocar o bloco `nodemailer.createTransport({...})` em `functions/index.js` por outro provedor (Resend, SendGrid, Mailgun etc. — todos têm exemplos prontos de integração com Nodemailer).

---

## Passos de deploy (ordem sugerida)

1. `firebase login`
2. `firebase init` neste diretório — escolher **Firestore** e **Functions** (já existem os arquivos de config, o `init` vai perguntar se quer sobrescrever: dizer não para não perder o que já está pronto).
3. `firebase functions:secrets:set EMAIL_USER` e `EMAIL_PASS` (ver acima).
4. `firebase deploy --only firestore:rules,functions`
5. Testar: abrir a URL da função `testarEnvioAgora` no navegador (aparece no terminal após o deploy) e conferir se o e-mail chega.
6. ~~Criar o frontend React...~~ — feito, vive em `web/`. Para rodar/deployar de novo, ver "Rodando localmente" e "Deploy" no [README.md](README.md).
7. ~~`vercel deploy`...~~ — feito; o site está publicado em `agenda-chromebooks.vercel.app`. Deploys seguintes: `vercel --prod` a partir da raiz do repo + `vercel alias set` (ver README para o porquê do passo extra).

---

## Segurança *(implementada — diferente do plano original abaixo)*

O plano original previa deixar as `firestore.rules` abertas no primeiro deploy e reforçar depois. Na prática, a hardening aconteceu em etapas (código geral → código + Firebase Auth por custom token → **Google Sign-In**) até chegar ao modelo atual, descrito em detalhe no [README.md](README.md#segurança):

- Login obrigatório em todo o site via Google Sign-In, restrito a contas `@edu.joinville.sc.gov.br` (`request.auth.token.email` checado nas `firestore.rules`).
- `gestores` e `bloqueios` exigem além disso a claim `gestor: true`.
- `reservas` e `professores` exigem que o e-mail do documento bata com quem está logado (`ehDono()`), impedindo agendar em nome de outra pessoa — esse era justamente o problema que motivou a evolução da "opção mínima" original para a solução completa com Google Sign-In.

Ver o README para os detalhes de configuração (proxy de `/__/auth/*` no Vercel, domínio autorizado no Google Cloud Console etc.), que não faziam parte do escopo original deste documento.
