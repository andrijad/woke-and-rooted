// Opis događaja piše vlasnica kroz editor, a HTML ide u dangerouslySetInnerHTML.
// Zato koristimo listu DOZVOLJENIH oznaka i atributa (sve ostalo se uklanja).
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A',
  'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'SPAN', 'DIV'
])
const DROP_WITH_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'SVG', 'MATH',
  'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'TEMPLATE', 'NOSCRIPT', 'BASE'
])
const SAFE_URL = /^(https?:|mailto:|tel:|#|\/(?!\/))/i

function cleanNode(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue // tekst
    if (child.nodeType !== 1) { child.remove(); continue }
    if (DROP_WITH_CONTENT.has(child.tagName.toUpperCase())) { child.remove(); continue }
    cleanNode(child)
    if (!ALLOWED_TAGS.has(child.tagName)) {
      child.replaceWith(...child.childNodes) // zadrži tekst, ukloni oznaku
      continue
    }
    for (const attr of [...child.attributes]) {
      if (child.tagName === 'A' && attr.name === 'href') {
        // pregledač ignoriše razmake/kontrolne karaktere u URL-u, pa ih skidamo pre provere
        // eslint-disable-next-line no-control-regex
        const url = attr.value.replace(/[\u0000- \u007f-\u009f]/g, '')
        if (!SAFE_URL.test(url)) child.removeAttribute('href')
      } else {
        child.removeAttribute(attr.name)
      }
    }
    if (child.tagName === 'A') child.setAttribute('rel', 'noopener noreferrer')
  }
}

export function sanitizeHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  cleanNode(doc.body)
  return doc.body.innerHTML
}

export function hasText(html) {
  if (!html) return false
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent.trim().length > 0
}
