import type { DeclaredFinancialSummary, PartialDate } from "./types";

/** Format reviewed decimal strings without passing through binary floating point. */
export function formatAmount(value: string) {
  const negative = value.startsWith("-"), [whole, cents] = (negative ? value.slice(1) : value).split(".");
  return `${negative ? "-" : ""}₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

function bounds(date: PartialDate) {
  const start = date.value + (date.precision === "year" ? "-01-01" : date.precision === "month" ? "-01" : "");
  if (date.precision === "day") return [start, start];
  if (date.precision === "year") return [start, `${date.value}-12-31`];
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  return [start, end.toISOString().slice(0, 10)];
}

/** Bounds are used only for ordering. An uncertain date never becomes a fabricated day. */
export function latestSummaryCandidates(values: { summary: DeclaredFinancialSummary; reportingDate: PartialDate }[]) {
  const latestStart = values.map(value => bounds(value.reportingDate)[0]).sort().at(-1);
  return latestStart ? values.filter(value => bounds(value.reportingDate)[1] >= latestStart) : [];
}
