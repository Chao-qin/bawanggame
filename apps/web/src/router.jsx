import { useEffect } from 'react'
import { createHashRouter, Navigate, useLocation, useParams, useRouteError } from 'react-router-dom'
import { reportError } from './error-reporting.js'
import App, { RuntimeFramePage } from './App.jsx'

const libraryTabs = new Set(['j2me', 'maopao', 'flash', 'flash-store', 'store'])

function RouteFailure() {
  const error = useRouteError()
  useEffect(() => { reportError(error, { kind: 'react', context: 'route' }) }, [error])
  return <div role="alert">页面加载失败，请刷新后重试。</div>
}

function UnknownRoute() {
  const location = useLocation()
  const requestedTab = new URLSearchParams(location.search).get('tab')
  const savedTab = localStorage.getItem('xiaochao-tab')
  const tab = libraryTabs.has(requestedTab) ? requestedTab : libraryTabs.has(savedTab) ? savedTab : 'j2me'
  return <Navigate replace to={`/library/${tab}`} />
}

export function createApplicationRouter(runtimeFrame) {
  const routes = runtimeFrame
    ? [
      { path: '/play/:kind/*', element: <RuntimeFramePage />, errorElement: <RouteFailure /> },
      { path: '*', element: null },
    ]
    : [
      {
        path: '/',
        element: <App />,
        errorElement: <RouteFailure />,
        children: [
          { path: 'library/:tab?' },
          { path: 'play/:kind/*' },
          { path: 'test/keyboard' },
          { path: 'keyboard' },
          { path: '*', element: <UnknownRoute /> },
        ],
      },
    ]
  return createHashRouter(routes)
}
