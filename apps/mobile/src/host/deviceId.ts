// The app's anonymous device id for usage statistics: a random UUID kept in the app's own files, so it stays the
// same across launches until the app's data is cleared or it is uninstalled. The page cannot keep it itself: the
// bundled site is served on a new loopback port each launch, and its browser storage is per port.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type DeviceIdFiles = {
  exists(path: string): Promise<boolean>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, contents: string, encoding: 'utf8'): Promise<void>
}

export function randomUuid(random: () => number = Math.random): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16))
  hex[12] = 4
  hex[16] = 8 + (hex[16] % 4)
  const text = hex.map((digit) => digit.toString(16)).join('')
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`
}

/** The stored id, or a new one saved for later launches; a storage failure still gives an id for this launch. */
export async function loadDeviceId(files: DeviceIdFiles, path: string, random?: () => number): Promise<string> {
  let stored = ''
  try {
    if (await files.exists(path)) stored = (await files.readFile(path, 'utf8')).trim()
  } catch {
    // The stored id may still be fine: keep it for later launches and use one just for this launch.
    return randomUuid(random)
  }
  if (UUID.test(stored)) return stored
  const id = randomUuid(random)
  await files.writeFile(path, id, 'utf8').catch(() => {})
  return id
}
