// 云服务客户端：WorkBuddy Cloud Service（小潮霸王 / wbapp_AcuC29CeJ61Bj442ArzTl0）
// publicConfig 来自 workbuddy_cloud_service activate 结果；publishableKey 可入源码、不入日志。
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'

const publicConfig = {
  endpoint: 'https://revival-arcade.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_AcuC29CeJ61Bj442ArzTl0_JfZdwe1FPhxGt5mUkRaVGnjtp70Vr7Rl',
}

export const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
})

// 匿名设备身份：免登录游戏厅，游玩记录按设备维度隔离（随机 UUID，无个人数据）
function getDeviceId() {
  let id = null
  try { id = localStorage.getItem('xiaochao-device-id') } catch (e) {}
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    try { localStorage.setItem('xiaochao-device-id', id) } catch (e) {}
  }
  return id
}

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

/** 记录一次游玩（fire-and-forget，失败静默不影响进入游戏） */
export function recordPlay(game) {
  return cloud.database
    .from('play_events')
    .insert({
      device_id: getDeviceId(),
      kind: game.kind,
      file: game.file,
      name: game.name || game.file,
    })
    .then(unwrap)
    .catch((e) => console.warn('[cloud] recordPlay failed:', e && e.message))
}

/** 本机最近在玩（按匿名设备 ID 隔离） */
export function fetchRecent(limit = 12) {
  return cloud.database
    .from('play_events')
    .select('kind, file, name, created_at')
    .eq('device_id', getDeviceId())
    .order('created_at', { ascending: false })
    .limit(limit)
    .then(unwrap)
    .catch((e) => {
      console.warn('[cloud] fetchRecent failed:', e && e.message)
      return []
    })
}

/** 大家都在玩（全服热门榜，RPC 聚合） */
export function fetchPopular(limit = 12) {
  return cloud.database
    .rpc('get_popular')
    .select('*')
    .limit(limit)
    .then(unwrap)
    .catch((e) => {
      console.warn('[cloud] fetchPopular failed:', e && e.message)
      return []
    })
}
