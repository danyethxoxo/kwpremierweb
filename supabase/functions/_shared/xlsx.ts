const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const WORKBOOK_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

export type XlsxStyle = 'title' | 'header' | 'date' | 'integer' | 'number' | 'note'

export type XlsxCell = {
  value: string | number | boolean | null
  style?: XlsxStyle
}

export type XlsxSheet = {
  name: string
  rows: XlsxCell[][]
  widths?: number[]
  freezeRows?: number
  autofilter?: boolean
}

const STYLE_IDS: Record<XlsxStyle, number> = {
  title: 1,
  header: 2,
  date: 3,
  integer: 4,
  number: 5,
  note: 6,
}

const encoder = new TextEncoder()

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function columnName(index: number): string {
  let n = index + 1
  let result = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

function styleAttribute(style?: XlsxStyle): string {
  return style ? ` s="${STYLE_IDS[style]}"` : ''
}

function cellXml(cell: XlsxCell, rowNumber: number, columnNumber: number): string {
  if (cell.value === null || cell.value === undefined) return ''
  const address = `${columnName(columnNumber)}${rowNumber}`
  const style = styleAttribute(cell.style)

  if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
    return `<c r="${address}"${style}><v>${cell.value}</v></c>`
  }

  if (typeof cell.value === 'boolean') {
    return `<c r="${address}" t="b"${style}><v>${cell.value ? 1 : 0}</v></c>`
  }

  return `<c r="${address}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`
}

function worksheetXml(sheet: XlsxSheet): string {
  const rows = sheet.rows.length ? sheet.rows : [[]]
  const maxColumns = Math.max(1, ...rows.map((row) => row.length))
  const maxRow = rows.length
  const lastCell = `${columnName(maxColumns - 1)}${maxRow}`
  const widthValues = sheet.widths || []
  const cols = widthValues.length
    ? `<cols>${widthValues.map((width, index) =>
      `<col min="${index + 1}" max="${index + 1}" width="${Math.max(4, Math.min(60, width))}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const freezeRows = Math.max(0, Math.min(sheet.freezeRows || 0, maxRow - 1))
  const sheetView = freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freezeRows + 1}" sqref="A${freezeRows + 1}"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const sheetRows = rows.map((row, rowIndex) => {
    const height = rowIndex === 0 && sheet.name === 'Resumen' ? ' ht="24" customHeight="1"' : ''
    const cells = row.map((cell, columnIndex) => cellXml(cell, rowIndex + 1, columnIndex)).join('')
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`
  }).join('')
  const filter = sheet.autofilter && maxRow > 1
    ? `<autoFilter ref="A1:${lastCell.replace(/^A1$/, `A1`)}"/>`
    : ''

  return `${XML_HEADER}<worksheet xmlns="${WORKBOOK_NS}" xmlns:r="${REL_NS}">
  <dimension ref="A1:${lastCell}"/>
  ${sheetView}
  <sheetFormatPr defaultRowHeight="16"/>
  ${cols}
  <sheetData>${sheetRows}</sheetData>
  ${filter}
</worksheet>`
}

function stylesXml(): string {
  return `${XML_HEADER}<styleSheet xmlns="${WORKBOOK_NS}">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/>
    <numFmt numFmtId="165" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="10"/><name val="Arial"/><color rgb="FF222222"/></font>
    <font><b/><sz val="14"/><name val="Arial"/><color rgb="FFB00020"/></font>
    <font><b/><sz val="10"/><name val="Arial"/><color rgb="FFFFFFFF"/></font>
    <font><i/><sz val="10"/><name val="Arial"/><color rgb="FF666666"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFB00020"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7E8EA"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/>
</styleSheet>`
}

function workbookXml(sheets: XlsxSheet[]): string {
  return `${XML_HEADER}<workbook xmlns="${WORKBOOK_NS}" xmlns:r="${REL_NS}">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets>${sheets.map((sheet, index) =>
    `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>
</workbook>`
}

function workbookRelationships(sheets: XlsxSheet[]): string {
  const sheetRelationships = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const stylesId = sheets.length + 1
  return `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">
  ${sheetRelationships}
  <Relationship Id="rId${stylesId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function contentTypesXml(sheets: XlsxSheet[]): string {
  const sheetTypes = sheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheetTypes}
</Types>`
}

function u16(value: number): Uint8Array {
  const output = new Uint8Array(2)
  new DataView(output.buffer).setUint16(0, value, true)
  return output
}

function u32(value: number): Uint8Array {
  const output = new Uint8Array(4)
  new DataView(output.buffer).setUint32(0, value >>> 0, true)
  return output
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let value = i
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[i] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function zipStore(files: Array<{ name: string; data: string }>): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.data)
    const checksum = crc32(data)
    const flags = 0x0800
    const local = joinBytes([
      u32(0x04034b50), u16(20), u16(flags), u16(0), u16(0), u16(0),
      u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ])
    localParts.push(local)
    centralParts.push(joinBytes([
      u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(0), u16(0),
      u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(localOffset), name,
    ]))
    localOffset += local.length
  }

  const centralDirectory = joinBytes(centralParts)
  const localFiles = joinBytes(localParts)
  const end = joinBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDirectory.length), u32(localFiles.length), u16(0),
  ])
  return joinBytes([localFiles, centralDirectory, end])
}

export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (!sheets.length) throw new Error('El libro necesita por lo menos una hoja.')
  const now = new Date().toISOString()
  const files: Array<{ name: string; data: string }> = [
    {
      name: '[Content_Types].xml',
      data: contentTypesXml(sheets),
    },
    {
      name: '_rels/.rels',
      data: `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
        <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
      </Relationships>`,
    },
    {
      name: 'docProps/core.xml',
      data: `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>KW Premier</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    },
    {
      name: 'docProps/app.xml',
      data: `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>KW Premier</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${xmlEscape(sheet.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`,
    },
    {
      name: 'xl/workbook.xml',
      data: workbookXml(sheets),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: workbookRelationships(sheets),
    },
    {
      name: 'xl/styles.xml',
      data: stylesXml(),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: worksheetXml(sheet),
    })),
  ]
  return zipStore(files)
}
