function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineMarkdown(value) {
  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  return html
}

export function renderSafeMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const output = []
  let inList = false
  let inCode = false
  let codeLines = []
  const closeList = () => {
    if (inList) {
      output.push('</ul>')
      inList = false
    }
  }
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList()
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeLines.push(line)
      continue
    }
    if (!line.trim()) {
      closeList()
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }
    const item = line.match(/^\s*[-*+]\s+(.+)$/)
    if (item) {
      if (!inList) {
        output.push('<ul>')
        inList = true
      }
      output.push(`<li>${inlineMarkdown(item[1])}</li>`)
      continue
    }
    closeList()
    output.push(`<p>${inlineMarkdown(line)}</p>`)
  }
  if (inCode) output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  closeList()
  return output.join('')
}

export function sortVersions(list = []) {
  return [...list].sort((left, right) => String(right?.version ?? right?.title ?? '').localeCompare(String(left?.version ?? left?.title ?? ''), undefined, { numeric: true, sensitivity: 'base' }))
}

export function currentVersion(list = []) {
  return list.find(item => item?.is_current === true)?.version || sortVersions(list)[0]?.version || ''
}

export function shouldAutoOpen(previousVersion, nextVersion) {
  return Boolean(nextVersion && previousVersion !== nextVersion)
}
