// Mirrors the server's own path substitution, so the page can name the destination it is about to ask for.

// The server replaces `{namespace}` inside an allowed directory before matching, so a client that did not would offer a directory its comparison can never match.
export function renderNamespace(path: string, namespace: string): string {
  return path.replaceAll('{namespace}', namespace)
}

// An empty name renders nothing rather than a half-filled path: the server refuses a nameless render too.
export function renderPathTemplate(template: string, namespace: string, name: string): string {
  if (!template || !name) return ''
  return renderNamespace(template, namespace).replaceAll('{name}', name)
}

// The directory a template renders into, with its file-name segment dropped; needs no Secret name.
export function templateDirectory(template: string, namespace: string): string {
  const parts = renderNamespace(template, namespace).split('/')
  parts.pop()
  return parts.join('/')
}

// The template's tail from the segment carrying `{name}` onward: with `apps/{name}/cred.yml` the last segment alone lands every Secret on one file.
export function renderedIdentityTail(template: string, namespace: string, name: string): string {
  if (!template || !name) return ''
  const segments = template.split('/')
  const from = segments.findIndex((segment) => segment.includes('{name}'))
  const tail = (from === -1 ? segments.slice(-1) : segments.slice(from)).join('/')
  return renderNamespace(tail, namespace).replaceAll('{name}', name)
}
