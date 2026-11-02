import { createContext, useContext } from 'react';
import type { AppNotification } from '@/lib/types';

export const OfferFocusContext = createContext<(item: AppNotification) => void>(() => {});

export function useOpenOffer() {
  return useContext(OfferFocusContext);
}
