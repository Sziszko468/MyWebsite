import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useConfirm } from '../components/Confirm'
import { useText } from '../i18n'

/**
 * Warns before unsaved work is lost. Closing the tab or reloading asks through the browser's own prompt. A click on a link of
 * this application asks first with the application's own dialog (the router in use cannot block a navigation, so the click is
 * caught on its way and the navigation is made after the answer). The browser's Back button cannot be intercepted by this router:
 * it is the one way out that is not guarded, and it is said so in the documentation.
 */
export function useUnsavedChanges(dirty: boolean): void {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const t = useText()
  const asking = useRef(false)

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.origin !== window.location.origin) return
      const here = window.location.pathname + window.location.search
      if (anchor.pathname + anchor.search === here) return
      event.preventDefault()
      event.stopPropagation()
      if (asking.current) return
      asking.current = true
      void confirm({ title: t.projects.confirm.leaveTitle, body: t.projects.confirm.leaveBody, confirmLabel: t.projects.confirm.leave, danger: true }).then((yes) => {
        asking.current = false
        // The application lives under /admin; the router's paths do not carry it.
        if (yes) void navigate((anchor.pathname + anchor.search + anchor.hash).replace(/^\/admin/, '') || '/')
      })
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty, confirm, navigate, t])
}
