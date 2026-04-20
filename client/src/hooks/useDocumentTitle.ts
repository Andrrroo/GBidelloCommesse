import { useEffect } from 'react';

const APP_NAME = 'GBidello Commesse';

/**
 * Imposta il <title> della pagina. Al unmount ripristina il titolo base.
 * Uso: useDocumentTitle('Dashboard') → "Dashboard · GBidello Commesse"
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
