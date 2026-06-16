# Tiptap — Editor estilo Notion (colunas + drag handle + export)

Brief de implementação para colar num chat com o Claude e pedir para reproduzir num
outro projeto **React + Tiptap (v2)**. Cada feature traz: o que faz, UX, abordagem
técnica e as pegadinhas que já resolvemos. Implemente na ordem.

## Stack / dependências

- `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-image`
- Export: `docx` (DOCX) e `fflate` (zip do IDML) — carregados via `import()` dinâmico (lazy)
- React 18 + Vite. Sem TypeScript no exemplo, mas o design vale igual em TS.

---

## 1. Imagem com redimensionamento (NodeView React)

**O que faz:** insere imagem (URL ou upload base64) e redimensiona arrastando barras
nas laterais (estilo Notion).

**Como:**
- Estenda `@tiptap/extension-image`:
  - `configure({ inline: false, allowBase64: true })`.
  - `draggable: false` no schema (o arraste é feito pelo handle de bloco, não pelo DnD nativo).
  - `addAttributes`: some `width` (número px) e `align` (`none|left|center|right`),
    com `parseHTML`/`renderHTML` (use `width` e `data-align`).
  - `addNodeView`: `ReactNodeViewRenderer(ImageView)`.
- `ImageView` (React, usa `NodeViewWrapper`):
  - `<img>` com `style={{ width }}`, `draggable="false"`.
  - duas alças laterais (`span`) com `onPointerDown` que arrasta a largura
    (`updateAttributes({ width })`). Direção: a alça esquerda cresce pra esquerda
    (`dir = -1`), a direita pra direita (`dir = +1`).
- Upload: `<input type="file">` → `FileReader.readAsDataURL` → `setImage({ src: dataURL })`.

**Pegadinha:** imagem é um nó **atômico/leaf**. Para achar o nó da imagem sob o cursor,
use `view.posAtCoords({left,top}).inside` (não o `resolve(pos)` comum, que cai no nível do doc).

---

## 2. Layout de colunas (nós customizados `columns`/`column`)

**O que faz:** blocos lado a lado (2 ou 3 colunas), com conteúdo editável em cada coluna.

**Como:**
- Nó `column`: `content: 'block+'`, `isolating: true`, atributo `width` (número fr,
  default null), render como `<div data-type="column" class="col" data-width="...">`.
- Nó `columns`: `group: 'block'`, `content: 'column{2,3}'`, `isolating: true`,
  render como `<div data-type="columns" class="cols-editable">`.
- CSS base: `.cols-editable { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3rem }`.
- **Larguras por coluna** via **plugin ProseMirror com decoration** (NÃO use NodeView aqui —
  NodeView com `NodeViewContent` quebrou o grid quando tentamos). No `addProseMirrorPlugins`
  do nó `columns`, um `Plugin` com `props.decorations` percorre cada nó `columns` e adiciona
  `Decoration.node(pos, pos+size, { style: 'grid-template-columns: <w1>fr <w2>fr ...' })`
  lendo `width` de cada coluna. Decoration aplica o estilo sem mexer na renderização do nó.

**Pegadinha:** se `grid-template-columns` não for aplicado, o grid cai em `auto-flow: row`
e as colunas **empilham** (1 char por linha em casos extremos). Mantenha o `grid-auto-flow: column`
como fallback e garanta o decoration.

---

## 3. Resizer cinza entre colunas (overlay React)

**O que faz:** ao passar o mouse na divisa entre colunas, surge uma linha cinza; arrastar
redistribui as larguras das duas colunas vizinhas.

**Como (componente overlay, irmão do `<EditorContent>`):**
- Em `editor.on('update'/'selectionUpdate')` + `scroll`/`resize`, percorra o doc procurando
  nós `columns`; para cada um, pegue `view.nodeDOM(pos)` e os retângulos dos filhos (`.col`);
  calcule o ponto médio entre colunas adjacentes → posicione uma alça `position: fixed`.
- `onPointerDown` na alça: converta o delta de px em `fr` (`delta/usableWidth * somaFr`,
  `usableWidth = domWidth - (n-1)*gap`), com mínimo de ~12% por coluna; despache
  `tr.setNodeMarkup(colPos, undefined, { ...attrs, width })` para as duas colunas.
- A alça em si é um `div` fino com `::after` que fica cinza no `:hover`.

---

## 4. Drag handle estilo Notion (`+ ⠿`) — próprio, sem extensão de terceiros

**O que faz:** ao passar o mouse à esquerda de um bloco, aparece um grupo `+ ⠿`.
`+` insere parágrafo abaixo; `⠿` arrasta o bloco (com fantasma + linha azul) ou, no clique,
abre um menu.

> Tentamos `tiptap-extension-global-drag-handle`, mas ela briga com lógica custom
> (DnD nativo duplicado, menu sumindo). **Construa um handle próprio**, controle total.

**Como (componente overlay):**
- Renderize um grupo fixo (`+` botão e `⠿` div). Em `editor.view.dom` no `mousemove`,
  ache o bloco interno sob o cursor e posicione o grupo à esquerda dele
  (`rect.left - 46`, `rect.top`). Esconda no `mouseleave` do card do editor.
- Aumente o `padding-left` do `.ProseMirror` (~50px) pra o handle caber no “gutter”.
- **Resolver o bloco sob (x,y)** — helper reutilizável `resolveBlock`:
  1. `const c = view.posAtCoords({left,top})`; se `c.inside >= 0` e `doc.nodeAt(c.inside)`
     for bloco não-contêiner (imagem!), use-o.
  2. senão, `resolve(c.pos)` e suba a profundidade ignorando `columns`/`column` até achar
     um bloco (parágrafo/heading). Isso faz o handle mirar a **linha interna** (dentro de
     coluna), não o bloco de colunas inteiro.
- `+` → `editor.chain().insertContentAt(pos+nodeSize, {type:'paragraph'}).setTextSelection(...).focus()`.
- `⠿` `onPointerDown`: se mover > 4px vira **drag** (item 5); senão, no `pointerup`, abre o **menu** (item 6).
- **Desligue o DnD nativo**: `Image` com `draggable:false` resolve a maioria; o drag é todo
  por pointer events.

---

## 5. Lógica de drop (fantasma + linha azul) — `blockDrag.js`

**O que faz:** durante o arraste de um bloco, um fantasma segue o cursor e uma **linha azul**
indica onde vai cair. Comportamento por zona do bloco-alvo:

- **lateral (28% esq/dir)** → linha **vertical** → soltar **cria colunas** (ou adiciona coluna).
- **meio (cima/baixo)** → linha **horizontal** → soltar **reordena/move**.
- **borda externa de um bloco de colunas** (faixa ≤10px no topo/base) → **1 linha por coluna**
  (largura total) → soltar **move pra fora das colunas** (largura total acima/abaixo).

**Criar/!adicionar coluna no drop lateral:**
- alvo em nível normal → embrulha `[arrastado, alvo]` num nó `columns` de 2 colunas
  (`tr.delete(dragNode)`, depois `tr.replaceWith(alvoRange, columnsNode)`, com `tr.mapping.map`).
- alvo **já dentro** de uma coluna → **insere uma nova coluna** no `columns` existente
  (esq/dir conforme o lado), até o máximo de 3 (não aninhe colunas).

**Detalhes:**
- Indicador é um container no `body` que desenha N segmentos (`div.drop-indicator`,
  `position: fixed`, azul; largura/altura via inline).
- Fantasma: clone da `<img>` (ou um chip de texto) com `opacity` e `pointer-events: none`.
- Use o mesmo `resolveBlock` do item 4 para achar o alvo (e o `inside` para imagens).
- Proteja os `dispatch` com `try/catch` (drops que esvaziariam coluna viram no-op).

---

## 6. Menu do handle: “Turn into” + “Apagar”

**O que faz:** clicar no `⠿` abre um menu pequeno ancorado no handle.

- **Turn into → 2 colunas / 3 colunas**: embrulha o bloco-alvo num `columns` com N colunas
  (1ª coluna recebe o bloco; demais, parágrafos vazios). `tr.replaceWith(pos, pos+size, columnsNode)`.
- **Apagar** (item vermelho):
  - bloco normal → `tr.delete(pos, pos+size)`.
  - **único bloco de uma coluna** → remove a **coluna**; se restaria **1 coluna**, **dissolve**
    o `columns` mantendo o conteúdo da coluna restante (`tr.replaceWith(columnsRange, [...filhos])`).
- Fecha em clique fora / `Escape`.

---

## 7. Persistência (IndexedDB, não localStorage)

**O que faz:** salva o HTML do editor e recarrega no F5 — inclusive com **imagens base64**.

**Pegadinha crítica:** `localStorage` estoura (`QuotaExceededError`, ~5MB) com 2+ imagens
base64 → o save falha e o conteúdo some no F5. **Use IndexedDB** (cota grande).

**Como:** helper `storage.js` com `loadContent/saveContent/clearContent` sobre IndexedDB
(fallback e migração do `localStorage`). No editor:
- `content: CONTENT` (default sync).
- `useEffect([editor])` → `loadContent(key)` → `editor.commands.setContent(html, false)`.
- `onUpdate` → `saveContent(key, editor.getHTML())` com **debounce ~400ms**.

---

## 8. Exportar DOCX (importável no InDesign via File > Place)

**O que faz:** gera `.docx` com texto, negrito/itálico, títulos, listas, **imagens** e
**colunas como tabela sem bordas** (largura proporcional). Lib `docx` (lazy).

- Percorra `editor.getJSON()`:
  - parágrafo/heading → `Paragraph` (+`HeadingLevel`); runs com `bold`/`italics` por mark.
  - lista → `Paragraph` com `bullet`.
  - imagem → decodifique o dataURL base64 → `Uint8Array`; `ImageRun({ data, type, transformation:{width,height} })`.
    Pegue dimensões reais via `naturalWidth/Height` dos `<img>` no DOM. **SVG**: pule
    (docx exige fallback) ou rasterize.
  - colunas → `Table` **borderless** com **`layout: TableLayoutType.FIXED` + `columnWidths`**
    (sem isso o Word faz auto-fit e colapsa as colunas → texto “1 char por linha”).
- `Packer.toBlob` → download.

---

## 9. Exportar IDML (InDesign nativo) — best-effort

**O que faz:** gera um `.idml` (ZIP de XMLs) que o InDesign abre via **File > Open**.
Texto, títulos, negrito/itálico e colunas-como-tabela num text frame. **Sem imagens**
(IDML usa link/embed complexo).

- Pacote (zip via `fflate`, **`mimetype` primeiro e sem compressão**): `designmap.xml`,
  `Resources/{Graphic,Fonts,Styles,Preferences}.xml`, `MasterSpreads/…`, `Spreads/…`
  (1 página Carta + 1 text frame nas margens), `Stories/Story_*.xml` (conteúdo), `XML/{BackingStory,Tags}.xml`,
  `META-INF/container.xml`.
- Texto: `ParagraphStyleRange` + `CharacterStyleRange` (FontStyle Bold/Italic, PointSize p/ título),
  cada parágrafo termina com `<Br/>`. Use estilos default `$ID/[No paragraph style]` etc.
- Colunas: `<Table>` com `Column SingleColumnWidth` proporcional e `Cell Name="i:0"`.
- **Aviso:** IDML é rígido e reflui o texto (fonte/medidas diferentes) — não fica idêntico
  à tela; valide abrindo no InDesign e itere.

> Para fidelidade visual 100% existe PDF (rasteriza o editor com `html2canvas`+`jsPDF`),
> mas o texto não fica editável no InDesign.

---

## Arquivos do projeto (referência de organização)

- `Editor.jsx` — `useEditor` + toolbar + monta overlays.
- `ResizableImage.js` + `ImageView.jsx` — imagem com resize.
- `ColumnsNodes.js` — nós `columns`/`column` + plugin de larguras (decoration).
- `ColumnResizers.jsx` — overlay das alças cinzas.
- `CustomDragHandle.jsx` — handle `+ ⠿` + menu (Turn into / Apagar).
- `blockDrag.js` — `resolveBlock` + drag (fantasma, linha azul, criar/mover colunas).
- `storage.js` — persistência IndexedDB.
- `exportDocx.js`, `exportIdml.js` — exports (lazy).

## Dicas de CSS

- `.ProseMirror { padding-left: 50px }` (gutter do handle).
- `.drop-indicator { position: fixed; background: #3b82f6 }` (linha azul).
- `.drag-ghost { position: fixed; opacity: .6; pointer-events: none }`.
- handle: grupo `position: fixed; opacity: 0` que vira 1 no hover do bloco.
