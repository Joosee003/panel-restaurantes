export function isValidNewTalgoPhone(value: string) {
  const compact = value.replace(/[\s().-]/g, "");
  if (/^(?:\+34|0034)?[6789]\d{8}$/.test(compact)) return true;
  return /^\+[1-9]\d{7,14}$/.test(compact) && !compact.startsWith("+34");
}
