// Opis događaja piše vlasnica kroz editor; ipak skidamo skripte i inline događaje
// pre prikaza (HTML ide u dangerouslySetInnerHTML).
export function sanitizeHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(n => n.remove())
  doc.body.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || (['href', 'src'].includes(name) && /^\s*javascript:/i.test(attr.value))) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return doc.body.innerHTML
}

export function hasText(html) {
  if (!html) return false
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent.trim().length > 0
}
