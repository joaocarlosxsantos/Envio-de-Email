# Envio de E-mails

Ferramenta interna para disparo de e-mails em massa via BCC, em lotes, com
acompanhamento de progresso em tempo real.

## Configuração

1. Instale as dependências (só precisa rodar uma vez, ou quando o
   `package.json` mudar):

   ```
   npm install
   ```

2. Configure suas credenciais: copie `.env.example` para `.env` e preencha
   `EMAIL_USER` / `EMAIL_PASS` com a conta que vai autenticar o envio.
   **O arquivo `.env` nunca deve ser commitado** (já está no `.gitignore`).

3. Inicie o servidor:

   ```
   npm start
   ```

4. Acesse http://127.0.0.1:3000 no navegador.

## Testar sem enviar e-mails de verdade

Defina `EMAIL_TRANSPORT=json` no `.env` (ou na variável de ambiente antes de
rodar `npm start`) para simular o envio — a interface funciona normalmente,
mas nenhum e-mail real é disparado. Um aviso "Modo de teste" aparece no topo
da página nesse caso.

## Funcionalidades

- Importação da lista de e-mails digitando, colando ou arrastando um arquivo
  `.csv`/`.txt`.
- Validação automática: e-mails inválidos e duplicados são detectados e
  removidos antes do envio, com contadores na tela.
- Envio em lotes (BCC) com barra de progresso em tempo real.
- Pré-visualização do HTML da mensagem antes de enviar.
- Caso o servidor de e-mail rejeite um lote no meio do envio, os lotes já
  enviados com sucesso são preservados e informados na tela.

## Observações sobre autenticação com Outlook/Office 365

Contas Outlook/Hotmail com verificação em duas etapas normalmente exigem uma
**senha de aplicativo** (não a senha normal da conta) para autenticação via
SMTP. Se o envio falhar com erro de autenticação:

1. Gere uma senha de aplicativo na conta Microsoft e use-a em `EMAIL_PASS`.
2. Se ainda assim falhar, tente configurar um host SMTP explícito no `.env`
   em vez do atalho `EMAIL_SERVICE`:

   ```
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587
   SMTP_SECURE=false
   ```

## Segurança

Nunca coloque usuário/senha diretamente no código (`server.js`). Todas as
credenciais vêm exclusivamente do arquivo `.env`, que é ignorado pelo git.
