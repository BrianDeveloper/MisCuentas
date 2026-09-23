import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function openWhatsApp(phone: string, message: string): void {
  const encoded = encodeURIComponent(message.replace(/\n/g, '\n'));
  if (isNative()) {
    window.location.href = `whatsapp://send?phone=${phone}&text=${encoded}`;
  } else {
    openExternal(`https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`);
  }
}
