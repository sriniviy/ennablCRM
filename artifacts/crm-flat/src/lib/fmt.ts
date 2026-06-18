export const toLabel = (s: string) =>
  s.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
