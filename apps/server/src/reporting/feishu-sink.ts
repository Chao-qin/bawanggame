import type { ReportCategory, ReportRecord } from './report-record.js'

export type FeishuConfig = { appId: string; appSecret: string; spreadsheet: string; sheets: Record<ReportCategory, string>; sessionSheet?: string }
export type Cell = string | number | undefined

export function feishuConfig(): FeishuConfig {
  return {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    spreadsheet: process.env.FEISHU_SPREADSHEET_TOKEN || '',
    sheets: { usage: process.env.FEISHU_USAGE_SHEET_ID || '', client_error: process.env.FEISHU_ERROR_SHEET_ID || '', server: process.env.FEISHU_SERVER_SHEET_ID || '' },
    sessionSheet: process.env.FEISHU_SESSION_SHEET_ID || '',
  }
}

// Untrusted client text must never become a spreadsheet formula.
const cell = (value: Cell) => typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value ?? ''
const column = (count: number) => String.fromCharCode(64 + count)

export class FeishuSink {
  private token = ''
  private expires = 0
  // Feishu accepts one write at a time per spreadsheet; event appends and session-row writes share this chain.
  private tail: Promise<unknown> = Promise.resolve()
  readonly enabled: boolean
  readonly sessionsEnabled: boolean

  constructor(private readonly config: FeishuConfig, private readonly fetcher: typeof fetch = fetch) {
    this.enabled = !!(config.appId && config.appSecret && config.spreadsheet && Object.values(config.sheets).every(Boolean))
    this.sessionsEnabled = this.enabled && !!config.sessionSheet
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation)
    this.tail = next.catch(() => {})
    return next
  }

  private async request(path: string, body: unknown, authenticated: boolean) {
    const response = await this.fetcher(`https://open.feishu.cn/open-apis/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000), redirect: 'error',
    })
    const result = await response.json() as Record<string, unknown>
    if (!response.ok || result.code !== 0) {
      if (response.status === 401 || [99991661, 99991663, 99991668, 99991677].includes(Number(result.code))) this.expires = 0
      throw new Error(`Feishu request failed (HTTP ${response.status}, code ${Number(result.code) || 'unknown'})`)
    }
    return result
  }

  private async authorize() {
    if (!this.enabled) throw new Error('Feishu reporting is not configured')
    if (Date.now() < this.expires) return
    const result = await this.request('auth/v3/tenant_access_token/internal', { app_id: this.config.appId, app_secret: this.config.appSecret }, false)
    if (typeof result.tenant_access_token !== 'string' || !result.tenant_access_token || typeof result.expire !== 'number' || result.expire <= 0) throw new Error('Invalid Feishu token response')
    this.token = result.tenant_access_token
    this.expires = Date.now() + Math.max(0, result.expire - 60) * 1000
  }

  private spreadsheetPath(operation: string) {
    return `sheets/v2/spreadsheets/${encodeURIComponent(this.config.spreadsheet)}/${operation}`
  }

  // INSERT_ROWS is a query parameter: in the body it is ignored and the default OVERWRITE writes over existing rows.
  // The range spans whole columns because it must be at least as large as the appended rows. Returns the first row written.
  private async appendRows(sheet: string, values: Cell[][]): Promise<number> {
    await this.authorize()
    const result = await this.request(`${this.spreadsheetPath('values_append')}?insertDataOption=INSERT_ROWS`, {
      valueRange: { range: `${sheet}!A:${column(values[0].length)}`, values: values.map(row => row.map(cell)) },
    }, true)
    const range = String((result.data as { updates?: { updatedRange?: unknown } } | undefined)?.updates?.updatedRange ?? '')
    return Number(/![A-Z]+(\d+):/.exec(range)?.[1] ?? 0)
  }

  append(records: ReportRecord[]): Promise<void> {
    return this.serial(async () => {
      if (!records.length) return
      if (!this.enabled) throw new Error('Feishu reporting is not configured')
      const category = records[0].category
      if (records.some(record => record.category !== category)) throw new Error('mixed report categories')
      await this.appendRows(this.config.sheets[category], records.map(record => [
        record.id, record.received_at, record.environment, record.category, record.level, record.type,
        record.device_id, record.platform, record.session_id, record.play_id,
        record.game?.kind, record.game?.file, record.game?.name, record.active_ms,
        record.error?.kind, record.error?.message ?? record.message, record.error?.stack,
        record.error ? JSON.stringify({ url: record.error.url, line: record.error.line, column: record.error.column, context: record.error.context }) : record.context,
        new Date(record.ts).toISOString(),
      ]))
    })
  }

  /** Appends new session rows; returns the sheet row of the first one (0 when Feishu did not say). */
  appendSessions(rows: Cell[][]): Promise<number> {
    return this.serial(async () => {
      if (!this.sessionsEnabled) throw new Error('Feishu session sheet is not configured')
      return this.appendRows(this.config.sessionSheet!, rows)
    })
  }

  /** Overwrites existing session rows in place. */
  updateSessions(rows: { row: number; values: Cell[] }[]): Promise<void> {
    return this.serial(async () => {
      if (!rows.length) return
      if (!this.sessionsEnabled) throw new Error('Feishu session sheet is not configured')
      await this.authorize()
      await this.request(this.spreadsheetPath('values_batch_update'), {
        valueRanges: rows.map(({ row, values }) => ({ range: `${this.config.sessionSheet}!A${row}:${column(values.length)}${row}`, values: [values.map(cell)] })),
      }, true)
    })
  }
}
