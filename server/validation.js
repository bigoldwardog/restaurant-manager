export function cleanRut(rut) {
  return String(rut || '').replace(/\./g, '').replace(/\s/g, '').toUpperCase()
}

export function isValidRut(rut) {
  const value = cleanRut(rut)
  if (!/^\d{7,8}-[\dK]$/.test(value)) return false
  const [body, verifier] = value.split('-')
  let sum = 0
  let multiplier = 2
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const expectedValue = 11 - (sum % 11)
  const expected = expectedValue === 11 ? '0' : expectedValue === 10 ? 'K' : String(expectedValue)
  return verifier === expected
}

export function publicUser(user) {
  if (!user) return null
  const { clave: _clave, ...safeUser } = user
  return safeUser
}

export function normalizeRole(role) {
  const value = String(role || '').toLowerCase()
  return ['gerente', 'mesero', 'cocinero'].includes(value) ? value : ''
}

export function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

export function forbidden(message) {
  const error = new Error(message)
  error.status = 403
  return error
}

export function notFound(message) {
  const error = new Error(message)
  error.status = 404
  return error
}
