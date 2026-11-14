import React from 'react'

const initialEditorLayerStyle = {
  position: 'absolute',
  top: '-10000px',
  right: 'auto',
  bottom: 'auto',
  left: '-10000px',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  opacity: 0,
  visibility: 'hidden',
  pointerEvents: 'none',
}

export function PhoneMarkup({ mrp = false }) {
  const blockRuntimeGesture = (event) => {
    const target = event.target
    if (target.closest?.('input, textarea, [contenteditable="true"]')) return
    event.preventDefault()
  }
  return <div className={'runtime-stage' + (mrp ? ' mrp-stage' : '')} data-runtime-stage onContextMenu={blockRuntimeGesture} onSelectStart={blockRuntimeGesture} onDragStart={blockRuntimeGesture}>
    <div id="phone" className="runtime-phone">
    <div id="editor-layer" className="runtime-editor-layer" style={initialEditorLayerStyle}>
      <div id="textarea-editor" className="textEditor" contentEditable="true" />
      <input id="password-editor" className="textEditor" type="password" />
      <input id="email-editor" className="textEditor" type="email" />
      <input id="number-editor" className="textEditor" type="number" />
      <input id="tel-editor" className="textEditor" type="tel" />
      <input id="url-editor" className="textEditor" type="url" />
    </div>
    <div id="display-container" data-runtime-control="display">
      <div id="display">
        <canvas id="canvas" tabIndex="-1" onContextMenu={(e) => e.preventDefault()} />
        {mrp ? <>
          <div id="mrp-loading"><div id="mrp-loading-text">正在启动冒泡社区…</div><progress id="mrp-progress" value="0" max="100" /></div>
          <div id="mrp-dialog">
            <h2 id="mrp-dialog-title">标题</h2>
            <textarea id="mrp-dialog-text" />
            <div className="bar"><button id="mrp-dialog-ok" type="button">确定</button><span id="mrp-dialog-info" /><button id="mrp-dialog-cancel" type="button">取消</button></div>
          </div>
        </> : <>
          <div id="download-screen" className="screen"><h1 className="title">Загрузка…</h1><div className="download-progress-container"><progress className="pack-activity" id="download-bar" value="0" max="100" /></div></div>
          <div id="splash-screen" className="screen"><h1 className="title">Запуск…</h1><div className="splash-progress-container"><progress /></div></div>
          <div id="exit-screen" className="screen" />
          <div id="background-screen" />
        </>}
      </div>
    </div>
    <div id="keypad">
      <canvas id="keypad-canvas" aria-hidden="true" />
      <div id="nav" data-runtime-control="nav">
        <button id="choice" className="key soft" title="左软键" />
        <div id="dpad"><button id="up" className="key dir" /><button id="left" className="key dir" /><button id="ok" className="key" /><button id="right" className="key dir" /><button id="down" className="key dir" /></div>
        <button id="back" className="key soft" title="右软键" /><button id="ret" className="key mini" title="挂机键">↩</button><button id="clear" className="key mini" title="清除">C</button>
      </div>
      <div id="numpad" data-runtime-control="numpad">{[['1','.,?'],['2','abc'],['3','def'],['4','ghi'],['5','jkl'],['6','mno'],['7','pqrs'],['8','tuv'],['9','wxyz'],['*','+'],['0','␣'],['#','⇧']].map(([n, sub]) => <button key={n} id={n === '*' ? 'star' : n === '#' ? 'pound' : `num${n}`} className="key"><b>{n}</b><i>{sub}</i></button>)}</div>
    </div>
    </div>
  </div>
}
