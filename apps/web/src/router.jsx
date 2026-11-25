import { createHashRouter, Navigate, useLocation, useParams } from 'react-router-dom'
import App, { RuntimeFramePage } from './App.jsx'

const libraryTabs = new Set(['j2me', 'maopao', 'flash', 'flash-store', 'store'])

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
      { path: '/play/:kind/*', element: <RuntimeFramePage /> },
      { path: '*', element: null },
    ]
    : [
      {
        path: '/',
        element: <App />,
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
