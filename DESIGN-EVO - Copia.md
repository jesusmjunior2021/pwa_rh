# EVO — mascote da COCARREIRA

> **Nota sobre a referência que você pediu.** Você citou os personagens de
> *Divertida Mente*. Não desenhei o EVO parecido com eles — são personagens
> protegidos da Disney/Pixar, e um mascote institucional do TJMA que lembre
> personagem licenciado é risco jurídico real, não detalhe. O que usei foram os
> **princípios de ofício** que aquele estúdio aplica e que não pertencem a
> ninguém: silhueta legível, olhos grandes e baixos no rosto, formas
> arredondadas sem quina, assimetria leve, uma emoção por pose. O EVO é
> construção original a partir dessas regras.

---

## A ideia

**EVO, de evolução.** Ele não é um mascote fixo colado ao lado do texto — ele
**cresce junto com a jornada do servidor**.

| Fase | Conformidade | O que é |
|---|---|---|
| **Semente** | 0–24% | Vaso com terra e a semente com um broto mínimo |
| **Broto** | 25–49% | Caule fino, duas folhas, cabeça pequena |
| **Muda** | 50–74% | Caule firme, folhagem redonda, copa definida |
| **Árvore** | 75–100% | Copa larga em três volumes, dois frutos laranja |

Isso resolve um problema concreto de gamificação institucional: pontos de
experiência, medalhas e troféus **infantilizam** um benefício público, e o
servidor de carreira sente isso na hora. Uma planta que cresce porque a pessoa
cumpriu etapas é uma metáfora que o adulto aceita — e que **diz a verdade sobre
o que está acontecendo**: formação é crescimento.

O estágio nunca é escolhido à mão. É derivado da conformidade real, a mesma que
a Coordenadoria vê na planilha.

---

## Construção da forma

**O vaso é a âncora.** Ele é idêntico nas quatro fases, e isso é deliberado: é o
que faz o olho reconhecer que semente e árvore são o **mesmo personagem em
momentos diferentes**, e não quatro desenhos distintos. Sem ele, o crescimento
leria como troca de mascote.

**Os olhos ficam baixos e bem separados.** É a regra que faz um personagem
parecer simpático em vez de vigilante — olho alto e junto lê como ameaça, mesmo
em traço mínimo. Cada olho tem um ponto de luz deslocado para cima e para a
direita, que é o que dá vida sem exigir detalhe.

**Sobrancelha só existe no alerta.** Personagem com sobrancelha permanente fica
com uma emoção fixa que briga com todas as outras expressões.

**Rubor só existe na alegria.** É o que diferencia "sorrindo" de "sorriso
educado".

**Traço uniforme de 2,4px** no viewBox de 100×124, cantos arredondados, sem
gradiente. A silhueta funciona em preto no tamanho de um polegar — teste que
todo mascote precisa passar e a maioria não passa.

### Expressões

| Expressão | Quando aparece | Construção |
|---|---|---|
| `neutro` | Estado normal | Boca em arco suave |
| `feliz` | Etapa cumprida, percurso regular ou completo | Boca cheia, rubor, faíscas laranja |
| `alerta` | Prazo vencido | Sobrancelhas inclinadas, boca oval |
| `dormindo` | Sem internet | Olhos em arco, "zzz" cinza subindo |

---

## Regras de uso

**Lugar fixo.** Sempre no topo da aba Trilha, sempre 78px, sempre com a fala à
direita. Mascote que aparece em lugares diferentes a cada tela vira surpresa, e
surpresa repetida vira irritação.

**Ele nunca repreende.** Quem está com prazo vencido já sabe que está. Mascote
cobrando é o caminho mais curto para a pessoa desinstalar o app. A fala do
alerta é *"Tem prazo vencido. Dá pra resolver — olha ali embaixo"*, não *"Você
está atrasado"*.

**Fala curta, primeira pessoa, no máximo duas linhas.** Ele comenta o estado,
não explica o sistema.

**Ele nunca sorri com prazo vencido na tela.** A expressão é derivada do estado
real (`situacaoAtual()` em `app.js`), nunca passada à mão em cada chamada.

**A animação de crescer dispara uma vez só**, quando o estágio muda de verdade.
O estágio anterior fica guardado em `localStorage`. Um evento que acontece toda
hora deixa de ser evento.

**A respiração é de 2,2% de escala em 4,2 segundos.** Existe para ele não
parecer adesivo colado na tela. Qualquer coisa mais forte vira distração num app
que a pessoa abre para resolver pendência.

---

## Por que SVG em código, e não PNG

1. **Escala.** O mesmo arquivo serve o ícone de 40px e a ilustração de 240px.
   PNG exigiria seis exportações e ainda ficaria borrado em tela de densidade
   alta.
2. **Estado.** A expressão muda conforme o que acontece com o servidor. Isso é
   atributo, não arquivo novo.
3. **Peso.** As quatro fases inteiras custam menos que um único PNG de 512px, e
   o app roda em 3G no interior do Maranhão.

---

## Prompt para gerar a arte de apresentação

Se você quiser uma versão ilustrada do EVO — para material impresso, papel de
parede, apresentação à Presidência — este é o prompt. Ele descreve o personagem
que já existe no código, para que a arte e o app não divirjam.

```
Mascote institucional original chamado EVO: uma pequena planta antropomórfica
num vaso de cerâmica cor de terra clara.

FORMA: corpo em folhagem verde-oliva (#6B7A3F) e verde-oliva claro (#97A667),
copa arredondada sem nenhuma quina, caule central firme, duas folhas laterais
assimétricas. Vaso trapezoidal simples com borda saliente, cor terra (#B9A88A).

ROSTO: dois olhos grandes, redondos, muito escuros, posicionados BAIXOS na copa
e bem separados entre si, cada um com um único ponto de luz branco deslocado
para cima e para a direita. Sorriso curvo e simétrico. Rubor laranja translúcido
(#D4762A a 40% de opacidade) em duas manchas ovais nas laterais. Sem nariz, sem
sobrancelhas, sem orelhas.

TRAÇO: contorno de espessura uniforme, cor grafite escuro (#22272B), cantos
arredondados, sem variação de peso. Preenchimento em cores chapadas, sem
gradiente, sem textura, sem sombra projetada. Estilo de ilustração vetorial
institucional contemporânea.

FUNDO: branco puro, isolado, sem cenário.

PROPORÇÃO: cabeça (copa) ocupando cerca de 45% da altura total, o que dá a
proporção infantil que gera simpatia sem infantilizar.

EXPRESSÃO: acolhedora e serena, confiante, nunca eufórica. É um personagem
institucional de serviço público, não de produto infantil.

NÃO INCLUIR: braços, pernas, roupas, acessórios, chapéu, óculos, texto,
logotipo, molduras, elementos de marca de terceiros, semelhança com qualquer
personagem de animação existente.
```

**Variações:** troque a descrição da forma pela fase desejada —
*"apenas uma semente redonda com um broto mínimo saindo do topo"* (semente),
*"caule fino com duas folhas e uma cabeça pequena"* (broto),
*"copa larga em três volumes com dois pequenos frutos laranja"* (árvore).

**Para as expressões:** substitua o parágrafo do rosto —
alerta: *"sobrancelhas inclinadas para dentro, boca em oval pequeno, sem rubor,
expressão preocupada mas não assustada"*;
dormindo: *"olhos fechados em dois arcos suaves, boca em linha reta curta, três
letras 'z' cinza subindo à direita da cabeça"*.

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `evo.js` | O personagem em SVG: quatro fases, quatro expressões, falas |
| `estilo.css` | Bloco `EVO — O MASCOTE`: painel, animações |
| `app.js` | `desenharEvo()` e `situacaoAtual()` |
| `evo-folha-de-estilo.html` | Folha do personagem, para conferência visual |

Abra a folha do personagem num navegador para ver as quatro fases lado a lado
com a paleta. É o arquivo que se leva para aprovação.
