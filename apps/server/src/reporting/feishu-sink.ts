import type { ReportCategory, ReportRecord } from './report-record.js'

export type FeishuConfig = { appId: string; appSecret: string; spreadsheet: string; sheets: Record<ReportCategory, string> }

export function feishuConfig(): FeishuConfig {
  return {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    spreadsheet: process.env.FEISHU_SPREADSHEET_TOKEN || '',
    sheets: { usage: process.env.FEISHU_USAGE_SHEET_ID || '', client_error: process.env.FEISHU_ERROR_SHEET_ID || '', server: process.env.FEISHU_SERVER_SHEET_ID || '' },
  }
}

export class FeishuSink {
  private token = ''
  private expires = 0
  readonly enabled: boolean

  constructor(private readonly config: FeishuConfig, private readonly fetcher: typeof fetch = fetch) {
    this.enabled = !!(config.appId && config.appSecret && config.spreadsheet && Object.values(config.sheets).every(Boolean))
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

  async append(records: ReportRecord[]) {
    if (!records.length) return
    if (!this.enabled) throw new Error('Feishu reporting is not configured')
    const category = records[0].category
    if (records.some(record => record.category !== category)) throw new Error('mixed report categories')
    if (Date.now() >= this.expires) {
      const result = await this.request('auth/v3/tenant_access_token/internal', { app_id: this.config.appId, app_secret: this.config.appSecret }, false)
      if (typeof result.tenant_access_token !== 'string' || !result.tenant_access_token || typeof result.expire !== 'number' || result.expire <= 0) throw new Error('Invalid Feishu token response')
      this.token = result.tenant_access_token
      this.expires = Date.now() + Math.max(0, result.expire - 60) * 1000
    }
    // Untrusted client text must never become a spreadsheet formula.
    const cell = (value: string | number | undefined) => typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value ?? ''
    const values = records.map(record => [
      record.id, record.received_at, record.environment, record.category, record.level, record.type,
      record.device_id, record.platform, record.session_id, record.play_id,
      record.game?.kind, record.game?.file, record.game?.name, record.active_ms,
      record.error?.kind, record.error?.message ?? record.message, record.error?.stack,
      record.error ? JSON.stringify({ url: record.error.url, line: record.error.line, column: record.error.column, context: record.error.context }) : record.context,
      new Date(record.ts).toISOString(),
    ].map(cell))
    await this.request(`sheets/v2/spreadsheets/${encodeURIComponent(this.config.spreadsheet)}/values_append`, {
      valueRange: { range: `${this.config.sheets[category]}!A1:S1`, values },
      insertDataOption: 'INSERT_ROWS',
    }, true)
  }
}
