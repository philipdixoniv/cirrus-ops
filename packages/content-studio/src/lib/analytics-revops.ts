// Pure analytics computation functions — ported from RevOps

export interface Opportunity {
  stage: string;
  amount: number;
  forecast_category?: string;
  [key: string]: any;
}

export interface ForecastWeight {
  stage: string;
  weight: number | string;
}

export interface WeightedOpportunity extends Opportunity {
  weight: number;
  weightedAmount: number;
}

export interface MrrSnapshot {
  snapshot_date: string;
  account_id?: string;
  subscription_id?: string;
  mrr: number | string;
  movement_type?: string;
}

export interface MrrByDate {
  date: string;
  total: number;
  new: number;
  expansion: number;
  contraction: number;
  churn: number;
  reactivation: number;
}

export function calculateWeightedPipeline(
  opportunities: Opportunity[],
  forecastWeights: ForecastWeight[],
): WeightedOpportunity[] {
  const weightMap: Record<string, number> = {};
  for (const w of forecastWeights) {
    weightMap[w.stage] = Number(w.weight);
  }

  return opportunities.map((opp) => ({
    ...opp,
    weight: weightMap[opp.stage] || 0,
    weightedAmount: Number(opp.amount) * (weightMap[opp.stage] || 0),
  }));
}

export function calculatePipelineForecast(
  opportunities: Opportunity[],
  forecastWeights: ForecastWeight[],
): number {
  const weighted = calculateWeightedPipeline(opportunities, forecastWeights);
  return weighted.reduce((sum, opp) => sum + opp.weightedAmount, 0);
}

export function calculateLTV(avgMrr: number, avgLifetimeMonths: number): number {
  return avgMrr * avgLifetimeMonths;
}

export function calculateCohortRetention(
  snapshots: MrrSnapshot[],
): Record<string, Record<string, { count: number; mrr: number }>> {
  const cohorts: Record<string, Record<string, { count: number; mrr: number }>> = {};
  const accountFirstSeen: Record<string, string> = {};

  for (const snap of snapshots) {
    const month = snap.snapshot_date.substring(0, 7);
    const key = snap.account_id || snap.subscription_id;
    if (!key) continue;
    if (!accountFirstSeen[key]) accountFirstSeen[key] = month;
  }

  for (const snap of snapshots) {
    const key = snap.account_id || snap.subscription_id;
    if (!key) continue;
    const cohortMonth = accountFirstSeen[key];
    const snapMonth = snap.snapshot_date.substring(0, 7);

    if (!cohorts[cohortMonth]) cohorts[cohortMonth] = {};
    if (!cohorts[cohortMonth][snapMonth]) {
      cohorts[cohortMonth][snapMonth] = { count: 0, mrr: 0 };
    }
    cohorts[cohortMonth][snapMonth].count++;
    cohorts[cohortMonth][snapMonth].mrr += Number(snap.mrr);
  }

  return cohorts;
}

export function aggregateMrrByDate(snapshots: MrrSnapshot[]): MrrByDate[] {
  const byDate: Record<string, MrrByDate> = {};
  for (const snap of snapshots) {
    const date = snap.snapshot_date;
    if (!byDate[date]) {
      byDate[date] = { date, total: 0, new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0 };
    }
    const mrr = Number(snap.mrr);
    byDate[date].total += mrr;
    if (snap.movement_type && snap.movement_type in byDate[date]) {
      (byDate[date] as any)[snap.movement_type] += mrr;
    }
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, data]) => data);
}

export function calculateNetRevenueRetention(
  currentMrr: number,
  expansionMrr: number,
  contractionMrr: number,
  churnMrr: number,
): number {
  if (currentMrr === 0) return 0;
  return ((currentMrr + expansionMrr - contractionMrr - churnMrr) / currentMrr) * 100;
}

export function pipelineByStage(
  opportunities: Opportunity[],
): Record<string, { count: number; totalAmount: number }> {
  const stages: Record<string, { count: number; totalAmount: number }> = {};
  for (const opp of opportunities) {
    if (!stages[opp.stage]) {
      stages[opp.stage] = { count: 0, totalAmount: 0 };
    }
    stages[opp.stage].count++;
    stages[opp.stage].totalAmount += Number(opp.amount);
  }
  return stages;
}

export function forecastByCategory(
  opportunities: Opportunity[],
): Record<string, number> {
  const categories: Record<string, number> = { pipeline: 0, best_case: 0, commit: 0, closed: 0 };
  for (const opp of opportunities) {
    const cat = opp.forecast_category || "pipeline";
    categories[cat] = (categories[cat] || 0) + Number(opp.amount);
  }
  return categories;
}
