import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function chunkArray(items, size) {
  const list = Array.isArray(items) ? items : [];
  const chunkSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize));
  }
  return chunks;
}

export function normalizeEmailList(emails = []) {
  const unique = new Set((emails || []).filter(Boolean).map((email) => normalizeEmail(email)));
  return Array.from(unique);
}

export function buildEmailSet(emails = []) {
  return new Set(normalizeEmailList(emails));
}

export function isValidEmail(value) {
  if (!value) return false;
  // More robust email validation - requires 2+ char domain and 2+ char TLD
  return /^[^\s@]+@[^\s@]{2,}\.[^\s@]{2,}$/.test(value);
}
