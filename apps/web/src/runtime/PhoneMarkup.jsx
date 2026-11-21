import React from 'react'
import { KeyboardSurface } from './keyboard/KeyboardSurface.jsx'

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

export function PhoneMarkup({ mrp = false, keyboardSession }) {
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
     <div id="keypad" data-runtime-control="keyboard"><KeyboardSurface session={keyboardSession} runtime={mrp ? 'mrp' : 'j2me'} /></div>
    </div>
  </div>
}
