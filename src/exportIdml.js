import { zipSync, strToU8 } from 'fflate'

// Exporta o documento como IDML (formato aberto que o InDesign abre via File > Open).
// Colunas viram uma tabela num text frame; negrito/itálico/títulos preservados.
// Imagens ainda não são incluídas (IDML usa link/embed complexo); ficam de fora por ora.

const DOM = '16.0'
const PKG = 'http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging'

const PAGE_W = 612
const PAGE_H = 792
const M = 72
const FRAME_W = PAGE_W - 2 * M
const FRAME_H = PAGE_H - 2 * M

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

let _id = 0
const uid = (p) => `${p}${(_id++).toString(36)}`

const fontStyle = (marks = []) => {
  const b = marks.some((m) => m.type === 'bold')
  const i = marks.some((m) => m.type === 'italic')
  if (b && i) return 'Bold Italic'
  if (b) return 'Bold'
  if (i) return 'Italic'
  return 'Regular'
}

function inlineXml(node, { size, bold } = {}) {
  const kids = node.content || []
  let out = ''
  let any = false
  for (const c of kids) {
    if (c.type !== 'text' || !c.text) continue
    any = true
    const marks = (c.marks || []).slice()
    if (bold) marks.push({ type: 'bold' })
    const attrs = [`AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"`]
    attrs.push(`FontStyle="${fontStyle(marks)}"`)
    if (size) attrs.push(`PointSize="${size}"`)
    out += `<CharacterStyleRange ${attrs.join(' ')}><Content>${esc(c.text)}</Content></CharacterStyleRange>`
  }
  if (!any) {
    out = `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content></Content></CharacterStyleRange>`
  }
  return out
}

function paragraphXml(node) {
  let size = null
  let bold = false
  if (node.type === 'heading') {
    const lvl = node.attrs?.level || 2
    size = lvl === 1 ? 26 : lvl === 2 ? 20 : 16
    bold = true
  }
  const inner = inlineXml(node, { size, bold })
  return (
    `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]" Justification="LeftAlign">` +
    inner +
    `<Br/></ParagraphStyleRange>`
  )
}

function listXml(node) {
  let out = ''
  for (const li of node.content || []) {
    for (const child of li.content || []) {
      if (child.type === 'paragraph') {
        const bulleted = { ...child, content: [{ type: 'text', text: '•\t' }, ...(child.content || [])] }
        out += paragraphXml(bulleted)
      } else {
        out += blockXml(child)
      }
    }
  }
  return out
}

function tableXml(node) {
  const cols = node.content || []
  const fr = cols.map((c) => c.attrs?.width || 1)
  const sum = fr.reduce((a, b) => a + b, 0) || cols.length
  const colW = fr.map((w) => (w / sum) * FRAME_W)
  const tid = uid('table')

  const columnsXml = cols
    .map((_, i) => `<Column Self="${tid}col${i}" Name="${i}" SingleColumnWidth="${colW[i].toFixed(2)}"/>`)
    .join('')
  const rowXml = `<Row Self="${tid}row0" Name="0" SingleRowHeight="40" AutoGrow="true" MinimumHeight="8"/>`

  const cellsXml = cols
    .map((col, i) => {
      const content = (col.content || []).map(blockXml).join('') || paragraphXml({ type: 'paragraph', content: [] })
      return (
        `<Cell Self="${tid}cell${i}" Name="${i}:0" RowSpan="1" ColumnSpan="1" ` +
        `AppliedCellStyle="CellStyle/$ID/[None]" LeftInset="4" RightInset="4" TopInset="2" BottomInset="2" ` +
        `LeftEdgeStrokeWeight="0" RightEdgeStrokeWeight="0" TopEdgeStrokeWeight="0" BottomEdgeStrokeWeight="0">` +
        content +
        `</Cell>`
      )
    })
    .join('')

  const table =
    `<Table Self="${tid}" AppliedTableStyle="TableStyle/$ID/[Basic Table]" ` +
    `HeaderRowCount="0" FooterRowCount="0" BodyRowCount="1" ColumnCount="${cols.length}">` +
    rowXml +
    columnsXml +
    cellsXml +
    `</Table>`

  return (
    `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]">` +
    `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">` +
    table +
    `</CharacterStyleRange><Br/></ParagraphStyleRange>`
  )
}

function blockXml(node) {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return paragraphXml(node)
    case 'bulletList':
    case 'orderedList':
      return listXml(node)
    case 'columns':
      return tableXml(node)
    case 'image':
      return ''
    default:
      return (node.content || []).map(blockXml).join('')
  }
}

function buildStory(storyId, json) {
  const body = (json.content || []).map(blockXml).join('') || paragraphXml({ type: 'paragraph', content: [] })
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:Story xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<Story Self="${storyId}" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">` +
    `<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>` +
    body +
    `</Story></idPkg:Story>`
  )
}

function buildDesignMap(storyId) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="16.0(0)" ?>` +
    `<Document xmlns:idPkg="${PKG}" DOMVersion="${DOM}" Self="idmldoc" StoryList="${storyId}" Name="export.idml" ZeroPoint="0 0">` +
    `<idPkg:Graphic src="Resources/Graphic.xml"/>` +
    `<idPkg:Fonts src="Resources/Fonts.xml"/>` +
    `<idPkg:Styles src="Resources/Styles.xml"/>` +
    `<idPkg:Preferences src="Resources/Preferences.xml"/>` +
    `<idPkg:Tags src="XML/Tags.xml"/>` +
    `<idPkg:MasterSpread src="MasterSpreads/MasterSpread_master.xml"/>` +
    `<idPkg:Spread src="Spreads/Spread_spread.xml"/>` +
    `<idPkg:BackingStory src="XML/BackingStory.xml"/>` +
    `<idPkg:Story src="Stories/Story_${storyId}.xml"/>` +
    `</Document>`
  )
}

function buildSpread(storyId) {
  const x0 = -FRAME_W / 2
  const x1 = FRAME_W / 2
  const y0 = -FRAME_H / 2
  const y1 = FRAME_H / 2
  const pt = (x, y) => `<PathPointType Anchor="${x} ${y}" LeftDirection="${x} ${y}" RightDirection="${x} ${y}"/>`
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:Spread xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<Spread Self="spread" FlattenerOverride="Default" ShowMasterItems="true" PageCount="1" BindingLocation="0" AllowPageShuffle="true" ItemTransform="1 0 0 1 0 0">` +
    `<Page Self="page" Name="1" AppliedMaster="MasterSpread/master" OverrideList="" GeometricBounds="0 0 ${PAGE_H} ${PAGE_W}" ItemTransform="1 0 0 1 -${PAGE_W / 2} -${PAGE_H / 2}">` +
    `<MarginPreference ColumnCount="1" ColumnGutter="12" Top="${M}" Bottom="${M}" Left="${M}" Right="${M}"/>` +
    `</Page>` +
    `<TextFrame Self="frame" ParentStory="${storyId}" ContentType="TextType" ItemTransform="1 0 0 1 0 0">` +
    `<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>` +
    pt(x0, y0) +
    pt(x0, y1) +
    pt(x1, y1) +
    pt(x1, y0) +
    `</PathPointArray></GeometryPathType></PathGeometry></Properties>` +
    `<TextFramePreference TextColumnCount="1" TextColumnGutter="12" VerticalJustification="TopAlign"/>` +
    `</TextFrame>` +
    `</Spread></idPkg:Spread>`
  )
}

function buildMasterSpread() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:MasterSpread xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<MasterSpread Self="master" Name="A-Master" NamePrefix="A" BaseName="Master" ShowMasterItems="true" PageCount="1" ItemTransform="1 0 0 1 0 0">` +
    `<Page Self="masterpage" Name="A" AppliedMaster="n" GeometricBounds="0 0 ${PAGE_H} ${PAGE_W}" ItemTransform="1 0 0 1 -${PAGE_W / 2} -${PAGE_H / 2}">` +
    `<MarginPreference ColumnCount="1" ColumnGutter="12" Top="${M}" Bottom="${M}" Left="${M}" Right="${M}"/>` +
    `</Page></MasterSpread></idPkg:MasterSpread>`
  )
}

function buildStyles() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:Styles xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<RootCharacterStyleGroup Self="charstyles">` +
    `<CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]" Imported="false"/>` +
    `</RootCharacterStyleGroup>` +
    `<RootParagraphStyleGroup Self="parastyles">` +
    `<ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" Imported="false"/>` +
    `<ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" Imported="false" NextStyle="ParagraphStyle/$ID/NormalParagraphStyle"/>` +
    `</RootParagraphStyleGroup>` +
    `<RootCellStyleGroup Self="cellstyles">` +
    `<CellStyle Self="CellStyle/$ID/[None]" Name="$ID/[None]" Imported="false"/>` +
    `</RootCellStyleGroup>` +
    `<RootTableStyleGroup Self="tablestyles">` +
    `<TableStyle Self="TableStyle/$ID/[No table style]" Name="$ID/[No table style]" Imported="false"/>` +
    `<TableStyle Self="TableStyle/$ID/[Basic Table]" Name="$ID/[Basic Table]" Imported="false"/>` +
    `</RootTableStyleGroup>` +
    `<RootObjectStyleGroup Self="objstyles">` +
    `<ObjectStyle Self="ObjectStyle/$ID/[None]" Name="$ID/[None]" Imported="false"/>` +
    `</RootObjectStyleGroup>` +
    `</idPkg:Styles>`
  )
}

function buildGraphic() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:Graphic xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black"/>` +
    `<Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="Paper"/>` +
    `<Swatch Self="Swatch/None" Name="None" ColorEditable="false"/>` +
    `</idPkg:Graphic>`
  )
}

function buildFonts() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:Fonts xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<FontFamily Self="fontfam" Name="Minion Pro">` +
    `<Font Self="font" FontFamily="Minion Pro" Name="Minion Pro" PostScriptName="MinionPro-Regular" Status="Installed" FontStyleName="Regular" FontType="OpenTypeCFF"/>` +
    `</FontFamily></idPkg:Fonts>`
  )
}

function buildPreferences() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:Preferences xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<DocumentPreference PageHeight="${PAGE_H}" PageWidth="${PAGE_W}" PagesPerDocument="1" FacingPages="false"/>` +
    `<ViewPreference HorizontalMeasurementUnits="Points" VerticalMeasurementUnits="Points"/>` +
    `</idPkg:Preferences>`
  )
}

function buildBackingStory() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:BackingStory xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<XmlStory Self="backing" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">` +
    `<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>` +
    `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]">` +
    `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content></Content></CharacterStyleRange>` +
    `</ParagraphStyleRange></XmlStory></idPkg:BackingStory>`
  )
}

function buildTags() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<idPkg:Tags xmlns:idPkg="${PKG}" DOMVersion="${DOM}">` +
    `<XMLTag Self="XMLTag/Root" Name="Root"><Properties><TagColor type="enumeration">LightBlue</TagColor></Properties></XMLTag>` +
    `</idPkg:Tags>`
  )
}

function buildContainer() {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">` +
    `<rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles></container>`
  )
}

export function exportToIdml(editor, filename = 'documento.idml') {
  _id = 0
  const json = editor.getJSON()
  const storyId = 'story'

  const files = {
    mimetype: [strToU8('application/vnd.adobe.indesign-idml-package'), { level: 0 }],
    'designmap.xml': strToU8(buildDesignMap(storyId)),
    'META-INF/container.xml': strToU8(buildContainer()),
    'Resources/Graphic.xml': strToU8(buildGraphic()),
    'Resources/Fonts.xml': strToU8(buildFonts()),
    'Resources/Styles.xml': strToU8(buildStyles()),
    'Resources/Preferences.xml': strToU8(buildPreferences()),
    'MasterSpreads/MasterSpread_master.xml': strToU8(buildMasterSpread()),
    'Spreads/Spread_spread.xml': strToU8(buildSpread(storyId)),
    [`Stories/Story_${storyId}.xml`]: strToU8(buildStory(storyId, json)),
    'XML/BackingStory.xml': strToU8(buildBackingStory()),
    'XML/Tags.xml': strToU8(buildTags()),
  }

  const zipped = zipSync(files, { level: 6 })
  const blob = new Blob([zipped], { type: 'application/vnd.adobe.indesign-idml-package' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
