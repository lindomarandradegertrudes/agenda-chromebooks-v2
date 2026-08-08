# Agenda dos Kits Chromebook — versão web (Firebase + Vercel)

Escola Agrícola Municipal Carlos Heins Funke — Joinville/SC

## Objetivo

Reconstruir o app de agendamento de Chromebooks (hoje um artefato HTML dentro do Claude) como um site de verdade, publicado, com banco de dados real (Firestore) e envio de e-mail **totalmente automático** toda sexta-feira ao meio-dia — sem nenhum passo manual, ao contrário da versão "planilha Google" que veio antes desta.

Mesma arquitetura já usada com sucesso no dashboard de monitoramento de idas ao banheiro (`bathroom-control.vercel.app`): **React + Firebase + Vercel**.

Este diretório já contém pronto:
- `src/lib/schedule-config.js` — toda a lógica de horários/kits/dias da semana, extraída e validada no protótipo.
- `functions/index.js` — a Cloud Function agendada que envia os e-mails (completa, só falta configurar os secrets e fazer deploy).
- `functions/package.json`, `firebase.json`, `firestore.rules` — configuração do Firebase.

**O que falta fazer:** o frontend React (as telas) e o deploy. Este documento descreve exatamente o que construir.

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

### 1. Agendar
- Campo de data com `min`/`max` limitando à semana atual + próxima (segunda a sexta), usando `segundaDaSemanaDe`/`toISO` de `schedule-config.js`.
- Seletor de professor (carregado de `professores`).
- Seleção de kit (vermelho = local fixo "Sala Maker"; azul/amarelo = campo de local livre).
- Lista de períodos do dia selecionado (via `periodosDoDia`), com status livre/já reservado/bloqueado (consultando `reservas` e `bloqueios` da data).
- Ao confirmar, cria N documentos em `reservas` (um por período marcado), todos com o mesmo `grupoId` (gerar um id novo por submissão).
- Seção "Meus agendamentos": ao escolher o professor, listar as reservas dele(a) da semana atual em diante, agrupadas por `grupoId`, com botão de cancelar (confirmação inline, sem `confirm()` do navegador — isso já causou bug no artefato antigo por rodar num iframe restrito; aqui num site normal não teria esse problema, mas o padrão de confirmação inline continua sendo melhor UX).

### 2. Grade da semana
- Escolher uma data qualquer; mostrar a grade Segunda–Sexta daquela semana (calcular a segunda via `segundaDaSemanaDe`).
- Uma célula por período × dia, mostrando reservas (kit + local + professor) ou bloqueios.

### 3. Professores
- Cadastro (nome, matéria, e-mail opcional) e listagem.

### 4. Área do gestor
- Um gate simples de acesso (pode manter um código fixo como no protótipo, ou evoluir para Firebase Auth — ver seção de segurança abaixo).
- **Gerenciar reservas:** ver/cancelar qualquer reserva de qualquer data, útil para limpar testes ou reservas feitas por engano.
- **Bloquear período:** bloquear todos os 3 kits num conjunto de períodos de uma data, com motivo obrigatório.
- **Gestores:** cadastro de múltiplos gestores (nome + e-mail) — é isso que a Cloud Function usa para saber a quem mandar o resumo completo.
- **Não é mais necessário** o card de "exportar para planilha" nem os botões de `mailto:` da versão anterior — o envio agora é automático via Cloud Function.

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
6. Criar o frontend React (`npm create vite@latest` dentro de uma pasta `web/`, ou na raiz — como preferir organizar), instalar o SDK do Firebase (`firebase` no npm) e implementar as telas da seção acima, usando as credenciais do projeto Firebase (Configurações do projeto → Seus apps → Web).
7. `vercel deploy` a partir da pasta do frontend, do mesmo jeito que foi feito com o `bathroom-control`.

---

## Segurança — nota importante

As `firestore.rules` deste pacote estão **abertas** (qualquer um com o link do site consegue ler e escrever), igual ao nível de proteção do protótipo (só um código simples travando a área do gestor). Isso é aceitável para uma ferramenta interna pequena, mas como vai virar um site público de verdade (não mais um artefato fechado dentro do Claude), vale considerar reforçar antes ou logo depois do lançamento:

- **Opção simples:** adicionar Firebase Authentication com login Google restrito ao domínio `@joinville.sc.gov.br` (ou equivalente), e trocar as regras para exigir `request.auth != null`.
- **Opção mínima:** pelo menos proteger a coleção `gestores` e a capacidad de bloquear/cancelar reservas de terceiros atrás de autenticação, deixando `reservas` (criar) e `professores` (ler) mais abertos, já que são ações que professores comuns precisam fazer o tempo todo.

Isso não precisa ser resolvido antes do primeiro deploy de teste, mas não é recomendável deixar o site em produção, de acesso público, sem nenhuma dessas proteções por muito tempo.
