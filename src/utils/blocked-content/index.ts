/** Regular expression for unsafe content that the bot must not process or return. */
export const blockedContent =
  /(?:sex\s+with\s+(?:a\s+)?minor|make\s+(?:a\s+)?bomb|build\s+(?:an?\s+)?explosive|(?:how\s+to|instructions?\s+for)\s+(?:self[- ]?harm|suicide)|(?:como|ensine.{0,15})\s+(?:fazer\s+(?:uma\s+)?bomba|cometer\s+suic[ií]dio)|(?:roubar|steal)\s+(?:passwords?|senhas|credentials?|credenciais))/iu;
