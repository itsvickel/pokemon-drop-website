const KEY = "tcg-alert-email";

export function getSavedEmail(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) ?? "";
}

export function saveEmail(email: string): void {
  if (typeof window === "undefined") return;
  const trimmed = email.trim();
  if (trimmed) localStorage.setItem(KEY, trimmed);
}
