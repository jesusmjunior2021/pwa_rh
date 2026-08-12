# Portal Auxílio-Bolsa — o que mudou e como aplicar

## O erro das duas telas tinha uma causa só

O `config.js` publicado aponta para uma URL terminada em **`/dev`**:

```
https://script.google.com/macros/s/AKfycbxOdaXIxhYtGRteTJr4lbYLyGcT1xbJSuV_l-e7QU7o/dev
```

O endereço `/dev` do Apps Script só responde à conta dona do script, estando
logada, e não devolve cabeçalho de CORS. Para o navegador de qualquer outra
pessoa — inclusive o seu, na aba do PWA — o pedido morre antes de chegar. O
`fetch` cai no `catch`, e o app mostra exatamente o que apareceu nas duas telas:
*"Sem conexão com o serviço agora."* Não era rede, nem senha, nem código.

O novo `config.js` usa a URL `/exec` que você enviou. Isso, sozinho, faz o login
administrativo e o login do servidor voltarem a funcionar.

---

## Antes de tudo: o `config.js` estava publicando a lista inteira

A versão que estava no ar trazia, dentro de um comentário, as 469 linhas de
`matrícula · nome completo · código de acesso` em texto claro. Repositório
privado protege o repositório, não o site: qualquer pessoa que abrisse
`https://pwarh.netlify.app/config.js` lia a lista completa, sem senha.

Isso anula todo o trabalho do `acessos.js` — que guarda só hash justamente para
isso não acontecer — e é dado pessoal de 469 servidores, com o alcance da LGPD.

O novo `config.js` está sem a lista. Mas publicar a versão limpa resolve daqui
para a frente e não desfaz o que já esteve no ar. **Enquanto os códigos atuais
não forem regerados, trate-os como conhecidos.** Regerar é rodar
`gerarCodigosParaTodos()` no Apps Script, reenviar aos servidores e gerar de
novo o `acessos.js` pela `ferramenta-codigos.html`.

A planilha no Drive é outra história: lá o controle é o compartilhamento, ela
está restrita, e o código em texto na aba faz sentido. O problema nunca foi a
planilha — foi o arquivo servido aberto pelo Netlify.

---

## O que foi feito

### `config.js` — refeito
- URL `/exec` correta.
- Lista removida.
- Bloco `admin` novo: `usuario` já vem preenchido no formulário e a senha, uma
  vez aceita, fica guardada naquele aparelho (`lembrar_no_aparelho`). Você
  digita uma vez por computador e o app passa a entrar sozinho.
- `admin.senha` existe e funciona se preenchido, mas está vazio de propósito:
  o acesso administrativo lê a jornada de qualquer servidor, e escrever a senha
  num arquivo servido aberto equivale a publicar a base inteira sem credencial.
  A guarda no aparelho dá a mesma comodidade sem esse custo.

### `portal_api.gs` — login pelo `SAL_CODIGOS`
- Nova função `_buscarSal()`: lê a aba **SAL_CODIGOS** (`Matrícula | Nome
  completo | Código SAL`), achando as colunas pelo cabeçalho e caindo para
  A/B/C se ele mudar.
- `_autenticar()` agora aceita **os dois**: o hash do `PORTAL_ACESSO` **ou** o
  código em texto do `SAL_CODIGOS`. É o que resolve o caso do servidor cujo
  código foi regerado numa aba e continuava recusado pela outra.
- `_acaoEntrar()` não quebra mais quando a matrícula existe só no
  `SAL_CODIGOS` — a contagem de acessos virou registro acessório, num `try`.
- `_abaBolsistas()`: a aba da ficha passou a ser encontrada pelo **cabeçalho**
  (`MATRÍCULA` junto de `CURSO`/`SELETIVO`/`TIPO DE BOLSA`), e não só pelo nome
  fixo `SERVIDORES CAEDNC`. Nome de aba muda; cabeçalho não. O `SAL_CODIGOS`
  não passa nesse teste, então não há risco de confusão entre as duas.
- Ação nova `diagnostico` (exige senha administrativa): responde qual aba virou
  a ficha, quantas linhas tem cada aba e se a árvore existe.

### `app.js`, `index.html`, `estilo.css` — a aba **Processo**
A jornada agora traz `percurso`, lido da aba `ARVORE_PROCESSOS`: processo de
origem no topo e, recuadas, as requisições que saíram dele — número, assunto,
unidade onde está, situação, data da última movimentação e há quantos dias
está parado.

Fica de fora o nome de quem está com o processo na mão. É servidor de outro
setor, não é dado do bolsista, e mostrar isso transforma consulta de andamento
em cobrança pessoal a um colega.

Quando a árvore ainda não foi ingerida, a tela **diz isso** em vez de ficar
vazia — tela vazia a pessoa lê como "não tem nada registrado a meu favor".

### `sw.js`
Versão `v1.1.2` → `v1.2.0`. Sem isso o navegador de quem já instalou continua
servindo a casca antiga e nada do que está acima aparece.

---

## Aplicação, na ordem

1. Substitua no repositório: `config.js`, `app.js`, `index.html`, `estilo.css`,
   `sw.js` e `apps_script/portal_api.gs`.
2. **Confirme que o `acessos.js` está indo junto no deploy.** A segunda tela
   dizia *"este aplicativo não tem a lista local de acessos"* — o
   `window.ACESSOS_LOCAIS` não existia naquela build. O arquivo está no
   repositório, gerado em 12/08 com 474 servidores; o que faltou foi publicá-lo.
3. No Apps Script: cole o `portal_api.gs` novo e **implante de novo**
   (Implantar → Gerenciar implantações → editar → Nova versão). Executar como
   **EU**, quem pode acessar **QUALQUER PESSOA**. Sem nova versão, o `/exec`
   continua servindo o código velho.
4. Publique no Netlify e abra o app com Ctrl+Shift+R uma vez.

## Conferência rápida

- `https://…/exec?acao=ping` no navegador deve devolver
  `{"ok":true,"servico":"portal-auxilio-bolsa",…}`. Se pedir login do Google,
  a implantação está como "somente eu" — é aí que está o problema.
- Entre como **BOLSAS**, busque uma matrícula conhecida e veja a jornada.
- Entre como servidor com `114272` / `963DPT` (a linha da primeira tela) e
  confira as abas Trilha, Prazos e Processo.

## Fica para a próxima etapa

O chat com o Grok, restrito ao edital do auxílio-bolsa, com links para as
páginas do Tribunal e do portal de RH. Ele precisa de chave e de uma decisão
sobre onde ela fica — e ela **não pode** ficar no `config.js`, pelo mesmo motivo
da lista de códigos. O caminho é uma ação nova no `portal_api.gs`, com a chave
nas Propriedades do Script, e o PWA falando só com o Apps Script.
