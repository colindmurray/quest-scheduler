import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function isValidEmail(value) {
  if (!value) return false;
  // More robust email validation - requires 2+ char domain and 2+ char TLD
  return /^[^\s@]+@[^\s@]{2,}\.[^\s@]{2,}$/.test(value);
}
