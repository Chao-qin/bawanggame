import React from 'react'
import { CheckOutline, CloseOutline, DownOutline, LeftOutline, MinusOutline, RightOutline, UndoOutline, UpOutline } from 'antd-mobile-icons'

function KeyIcon({ as: Icon }) {
  return <Icon className="keypadIcon" aria-hidden="true" />
}

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
    if (!target.closest?.('#keypad')) return
    if (target.closest?.('#editor-layer, #mrp-dialog-text, #panel')) return
    event.preventDefault()
  }
  return <div className={'runtime-stage' + (mrp ? ' mrp-stage' : '')} data-runtime-stage>
    <div id="phone" className="runtime-phone">
    <form id="editor-layer" className="runtime-editor-layer" style={initialEditorLayerStyle} onSubmit={(event) => event.preventDefault()} autoComplete="off">
      <div id="textarea-editor" className="textEditor" contentEditable="true" />
      <input id="password-editor" className="textEditor" type="password" />
      <input id="email-editor" className="textEditor" type="email" />
      <input id="number-editor" className="textEditor" type="number" />
      <input id="tel-editor" className="textEditor" type="tel" />
      <input id="url-editor" className="textEditor" type="url" />
    </form>
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
    <div id="keypad" onTouchStartCapture={blockRuntimeGesture} onTouchMoveCapture={blockRuntimeGesture} onContextMenuCapture={blockRuntimeGesture} onDragStartCapture={blockRuntimeGesture}>
      <canvas id="keypad-canvas" aria-hidden="true" />
      <div id="nav" data-runtime-control="nav">
        <button id="choice" className="key soft" title="左软键"><KeyIcon as={MinusOutline} /></button>
        <div id="dpad">
          <button id="up" className="key dir" aria-label="上"><KeyIcon as={UpOutline} /></button>
          <button id="left" className="key dir" aria-label="左"><KeyIcon as={LeftOutline} /></button>
          <button id="ok" className="key" aria-label="确认"><KeyIcon as={CheckOutline} /></button>
          <button id="right" className="key dir" aria-label="右"><KeyIcon as={RightOutline} /></button>
          <button id="down" className="key dir" aria-label="下"><KeyIcon as={DownOutline} /></button>
        </div>
        <button id="back" className="key soft" title="右软键"><KeyIcon as={MinusOutline} /></button>
        <button id="ret" className="key mini" title="挂机键"><KeyIcon as={UndoOutline} /></button>
        <button id="clear" className="key mini" title="清除"><KeyIcon as={CloseOutline} /></button>
      </div>
      <div id="numpad" data-runtime-control="numpad">{[['1','.,?'],['2','abc'],['3','def'],['4','ghi'],['5','jkl'],['6','mno'],['7','pqrs'],['8','tuv'],['9','wxyz'],['*','+'],['0','␣'],['#','⇧']].map(([n, sub]) => <button key={n} id={n === '*' ? 'star' : n === '#' ? 'pound' : `num${n}`} className="key"><b>{n}</b><i>{sub}</i></button>)}</div>
    </div>
    </div>
  </div>
}
