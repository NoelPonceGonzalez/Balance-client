import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function docId(value: { id?: string; _id?: string } | null | undefined): string {
  return String(value?.id || value?._id || '');
}
