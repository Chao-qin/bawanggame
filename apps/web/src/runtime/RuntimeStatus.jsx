export function RuntimeLoading({ label = '正在准备模拟器…' }) {
  return <div className="runtimeBoot" role="status" aria-live="polite"><span className="runtimeBootSpinner" aria-hidden="true" /><span>{label}</span></div>
}

export function RuntimeFailure({ message }) {
  return <div className="runtimeFailure" role="alert">
    <strong>模拟器资源加载失败</strong>
    <span>{message || '请重试。'}</span>
    <button className="runtimeFailureButton" type="button" onClick={() => window.location.reload()}>重新加载</button>
  </div>
}
