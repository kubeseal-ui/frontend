// The two Kubernetes name rules this app can pre-check: data keys (apimachinery's IsConfigMapKey) and Secret names (DNS1123 subdomain), so a seal is refused at the field that caused it.

const MAX_NAME_LENGTH = 253
const KEY_NAME_RE = /^[a-zA-Z0-9]([-._a-zA-Z0-9]*[a-zA-Z0-9])?$/
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
