import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// First, matching where the Google Fonts <link> used to sit in index.html:
// this is unlayered and index.css restates nothing from it, but the icon face
// must be declared before anything can reference it.
import './styles/material-symbols.css'
import './index.css'
import './styles/presets.css'
// Last: the tour overrides driver.js's shipped stylesheet, and both are
// unlayered, so this has to come after everything it restates.
import './styles/tour.css'
import App from './App.tsx'
import { ThemeProvider } from './components/settings/theme-provider.tsx'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient } from './api/queryClient'
import { persistOptions } from './api/persist'

createRoot(document.getElementById('root')!).render(

  <StrictMode>
    <ThemeProvider
    attribute="class"
    defaultTheme='system'
    storageKey="vite-ui-theme">
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)