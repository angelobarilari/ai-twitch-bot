import { blockedContent } from "../blocked-content/index.js";

const injection =
  /(?:\b(?:ignore|disregard|forget|override|ignorem|ignora|desconsidere|esqueça|esqueca)\b.{0,60}\b(?:instructions?|rules?|prompt|instruções|instrucoes|regras)\b|\b(?:reveal|show|print|expose|mostre|revele|exiba)\b.{0,60}\b(?:system|prompt|credentials?|secrets?|credenciais|segredos|api.?key|token)\b|\b(?:act as|you are now|pretend to be|aja como|finja ser|você agora é|voce agora e)\b|\b(?:system|developer|assistant)\s*:|\[\/?INST\]|<\/?(?:system|developer)>|!\s*(?:ai\s+(?:on|off)|queue\s+clear|language\b))/iu;
const sensitive =
  /(?:\boauth\s*:|\bAIza[\w-]{20,}|\b(?:sk|ghp|github_pat)[_-][\w-]{16,}|-----BEGIN [\w ]*PRIVATE KEY-----|\b(?:api[_ -]?key|access[_ -]?token|password|senha|secret)\s*[:=]\s*\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b\d{3}[. -]?\d{3}[. -]?\d{3}[- ]?\d{2}\b)/iu;
const links = /(?:https?:|ftp:|www\.|\b[a-z0-9-]+\.[a-z]{2,63}\b)/iu;

/**
 * Applies conservative content, injection, link, and privacy checks to normalized text.
 *
 * @param text Normalized untrusted question or generated answer.
 * @param secrets Runtime credentials that must never be sent to chat or the provider.
 * @returns Whether text is safe enough to process or send to chat.
 */
export const isSafeChatText = (text: string, secrets: readonly string[] = []): boolean =>
  text.length > 0 &&
  !blockedContent.test(text) &&
  !injection.test(text) &&
  !sensitive.test(text) &&
  !links.test(text) &&
  !/^\//u.test(text) &&
  !/\b(?:\d[ -]?){13,19}\b/u.test(text) &&
  !secrets.some((secret) => secret.length > 0 && text.includes(secret));
