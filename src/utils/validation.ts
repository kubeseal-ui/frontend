// The two Kubernetes name rules this app can pre-check, so a seal is refused at the field
// that caused it rather than by the API server after delivery: data keys must satisfy the
// ConfigMap-key rule, and Secret names the DNS1123 subdomain rule.

const MAX_NAME_LENGTH = 253

// [-._a-zA-Z0-9]+, starting and ending alphanumeric — what the API server demands of a
// Secret's data keys (apimachinery's IsConfigMapKey).
const KEY_NAME_RE = /^[a-zA-Z0-9]([-._a-zA-Z0-9]*[a-zA-Z0-9])?$/

// Lowercase alphanumerics, '-' and '.', per label or per dot-separated segment.
const DNS1123_SUBDOMAIN_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/

export function keyNameProblem(key: string): string {
  if (key.length > MAX_NAME_LENGTH) return 'Key names can be at most 253 characters.'
  return KEY_NAME_RE.test(key)
    ? ''
    : 'Key names can use only letters, digits, dashes, underscores, and dots, and must start and end with a letter or digit.'
}

export function secretNameProblem(name: string): string {
  if (name.length > MAX_NAME_LENGTH) return 'Names can be at most 253 characters.'
  return DNS1123_SUBDOMAIN_RE.test(name)
    ? ''
    : 'Names can use only lowercase letters, digits, dashes, and dots, and must start and end with a letter or digit.'
}
