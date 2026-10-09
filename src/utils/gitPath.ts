// A mapping's path template and allowed directories are carried raw by the listing, because a
// per-namespace response has no Secret name to render `{name}` with. These mirror the server's own
// substitution, so the page can name the destination it is about to ask for.

// The prefix half of it, for paths that name no Secret: the server replaces `{namespace}` inside an
// allowed directory before matching anything against it, so a client that did not would offer a
// directory its comparison can never match.
export function renderNamespace(path: string, namespace: string): string {
  return path.replaceAll('{namespace}', namespace)
}

// renderPathTemplate substitutes one identity. An empty name renders nothing rather than a
// half-filled path: the server refuses a nameless render too, so the page must not offer a
// destination it cannot name.
export function renderPathTemplate(template: string, namespace: string, name: string): string {
  if (!template || !name) return ''
  return renderNamespace(template, namespace).replaceAll('{name}', name)
}

// The directory a template renders into, with its file-name segment dropped. Needs no Secret
// name, which is what lets the namespace rail say where the default lands before one is typed.
export function templateDirectory(template: string, namespace: string): string {
  const parts = renderNamespace(template, namespace).split('/')
  parts.pop()
  return parts.join('/')
}

// The file name a rendered path ends in — what a chosen directory has to be joined with, since a
// bare directory is not a destination the server will accept.
export function renderedFileName(rendered: string): string {
  return rendered.split('/').pop() || ''
}
