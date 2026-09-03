/**
 * A small TypeScript / TSX tokenizer for demo code blocks. It is deliberately
 * approximate: good enough to colour keywords, strings, numbers, comments,
 * type names, JSX tags and punctuation in short snippets, with no dependency.
 *
 * Every token maps to a `gd-tok-<kind>` class; colours live in demo.css.
 */

export type TokenKind =
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'fn'
  | 'tag'
  | 'attr'
  | 'punc'
  | 'text'

export type Token = { kind: TokenKind; text: string }

const KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'return',
  'satisfies',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'yield',
])

/** Words that introduce a type position for the next identifier. */
const TYPE_LEADERS = new Set([
  'type',
  'interface',
  'extends',
  'implements',
  'as',
  'new',
  'satisfies',
])

const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'void',
  'never',
  'unknown',
  'any',
  'object',
  'symbol',
  'bigint',
])

const IDENT_START = /[A-Za-z_$]/
const IDENT = /[A-Za-z0-9_$]/
const DIGIT = /[0-9]/

/** Split source into tokens. Whitespace and plain identifiers come back as `text`. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const push = (kind: TokenKind, text: string) => {
    if (text.length === 0) return
    const last = tokens[tokens.length - 1]
    if (last && last.kind === kind && (kind === 'text' || kind === 'punc')) last.text += text
    else tokens.push({ kind, text })
  }

  let i = 0
  // `lastWord` is the last significant word, `lastPunc` the last significant
  // punctuation character; together they decide whether an identifier sits in
  // a type position.
  let lastWord = ''
  let lastPunc = ''
  // JSX: inside a tag (between `<Name` and `>`), identifiers are attributes.
  let inTag = false
  let braceDepth = 0
  const tagBraceStack: number[] = []

  const significant = (text: string) => {
    lastWord = text
    lastPunc = ''
  }

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      let j = i
      while (j < source.length && /\s/.test(source[j])) j += 1
      push('text', source.slice(i, j))
      i = j
      continue
    }

    // Comments
    if (ch === '/' && next === '/') {
      let j = source.indexOf('\n', i)
      if (j === -1) j = source.length
      push('comment', source.slice(i, j))
      i = j
      continue
    }
    if (ch === '/' && next === '*') {
      let j = source.indexOf('*/', i + 2)
      j = j === -1 ? source.length : j + 2
      push('comment', source.slice(i, j))
      i = j
      continue
    }

    // Strings (template literals are kept whole, `${}` included)
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === ch) {
          j += 1
          break
        }
        if (ch !== '`' && source[j] === '\n') break
        j += 1
      }
      push('string', source.slice(i, j))
      significant('')
      i = j
      continue
    }

    // Numbers
    if (DIGIT.test(ch) || (ch === '.' && next !== undefined && DIGIT.test(next))) {
      let j = i
      while (j < source.length && /[0-9A-Fa-fxXobBn_.eE]/.test(source[j])) j += 1
      push('number', source.slice(i, j))
      significant('')
      i = j
      continue
    }

    // Identifiers and keywords
    if (IDENT_START.test(ch)) {
      let j = i
      while (j < source.length && IDENT.test(source[j])) j += 1
      const word = source.slice(i, j)
      let k = j
      while (k < source.length && (source[k] === ' ' || source[k] === '\t')) k += 1
      const after = source[k] ?? ''

      if (inTag) {
        if (lastPunc === '<' || lastPunc === '</' || lastPunc === '.') push('tag', word)
        else push('attr', word)
      } else if (KEYWORDS.has(word)) {
        push('keyword', word)
      } else if (
        (lastPunc === ':' || lastPunc === '<' || lastPunc === '|' || lastPunc === '&') &&
        (PRIMITIVE_TYPES.has(word) || /^[A-Z]/.test(word))
      ) {
        push('type', word)
      } else if (TYPE_LEADERS.has(lastWord) && /^[A-Z]/.test(word)) {
        push('type', word)
      } else if (after === '(') {
        push('fn', word)
      } else if (/^[A-Z][A-Za-z0-9]*$/.test(word) && after === '<') {
        push('type', word)
      } else {
        push('text', word)
      }
      significant(word)
      i = j
      continue
    }

    // JSX tag boundaries: `<Name`, `</Name`, `<>`; a closing `>` or `/>` ends the tag.
    if (ch === '<' && !inTag) {
      const rest = source.slice(i + 1, i + 3)
      const opensTag = /^[A-Za-z]/.test(rest) || rest.startsWith('/') || rest.startsWith('>')
      // Generics like `Map<string, number>` follow an identifier without a space;
      // a JSX tag follows punctuation, a keyword, or a line break.
      const looksLikeGeneric =
        /^[A-Za-z0-9_$]$/.test(lastWord.slice(-1)) &&
        !KEYWORDS.has(lastWord) &&
        lastPunc === '' &&
        i > 0 &&
        /[A-Za-z0-9_$]/.test(source[i - 1])
      if (opensTag && !looksLikeGeneric) {
        inTag = true
        tagBraceStack.push(braceDepth)
        if (rest.startsWith('/')) {
          push('punc', '</')
          lastPunc = '</'
          lastWord = ''
          i += 2
          continue
        }
        push('punc', '<')
        lastPunc = '<'
        lastWord = ''
        i += 1
        continue
      }
    }
    if (inTag && ch === '>') {
      push('punc', '>')
      inTag = false
      tagBraceStack.pop()
      lastPunc = '>'
      lastWord = ''
      i += 1
      continue
    }
    if (inTag && ch === '/' && next === '>') {
      push('punc', '/>')
      inTag = false
      tagBraceStack.pop()
      lastPunc = '>'
      lastWord = ''
      i += 2
      continue
    }
    if (inTag && ch === '{') {
      // An attribute expression: leave tag mode until the matching brace.
      braceDepth += 1
      push('punc', '{')
      inTag = false
      lastPunc = '{'
      lastWord = ''
      i += 1
      continue
    }
    if (ch === '{') braceDepth += 1
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      const top = tagBraceStack[tagBraceStack.length - 1]
      if (top !== undefined && braceDepth === top) inTag = true
    }

    // Punctuation
    if (/[{}()[\];,.<>=+\-*/%!?:&|^~@#]/.test(ch)) {
      push('punc', ch)
      lastPunc = ch
      lastWord = ''
      i += 1
      continue
    }

    push('text', ch)
    i += 1
  }

  return tokens
}

/** Tokens with their start offset in the source, for stable keys in renderers. */
export function tokenizeWithOffsets(source: string): (Token & { start: number })[] {
  const out: (Token & { start: number })[] = []
  let offset = 0
  for (const token of tokenize(source)) {
    out.push({ ...token, start: offset })
    offset += token.text.length
  }
  return out
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Source to HTML: `<span class="gd-tok-keyword">const</span> ...`. */
export function highlightHtml(source: string): string {
  return tokenize(source)
    .map((token) =>
      token.kind === 'text'
        ? escapeHtml(token.text)
        : `<span class="gd-tok-${token.kind}">${escapeHtml(token.text)}</span>`,
    )
    .join('')
}

/**
 * Paint highlighted code into an element. The element receives the `gd-code`
 * class so the kit's code styling applies; pass a `<pre>` or a `<code>`.
 */
export function renderCode(element: HTMLElement, code: string, lang = 'tsx') {
  element.classList.add('gd-code')
  element.dataset.lang = lang
  element.innerHTML = highlightHtml(code)
}
