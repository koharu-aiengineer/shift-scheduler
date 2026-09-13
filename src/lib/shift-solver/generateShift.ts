import { detectViolations } from "./detectViolations";
import { computeFairnessScore } from "./fairness";
import { buildGreedySolution } from "./greedy";
import { runLocalSearch } from "./localSearch";
import type { SolverInput, SolverOutput } from "./types";

export type GenerateShiftOptions = {
  maxIterations?: number; // localSearchの反復回数上限（未指定なら規模に応じた既定値）
};

// シフト自動生成の公開エントリポイント。
// resolveRequirements → greedy → localSearch → violations再計算 → fairnessScore算出
// の順に実行する。violationsは必ずlocalSearch後の最終的なassignmentsから
// detectViolationsで再計算しており、greedy構築時点のスナップショット
// （buildGreedySolutionが返すviolations）はここでは使わない。
export function generateShift(input: SolverInput, options: GenerateShiftOptions = {}): SolverOutput {
  const { assignments: greedyAssignments } = buildGreedySolution(input);

  const assignments = runLocalSearch(input, greedyAssignments, {
    randomSeed: input.randomSeed,
    maxIterations: options.maxIterations,
  });

  const violations = detectViolations(assignments, input);
  const fairnessScore = computeFairnessScore(assignments, input.employees, violations);

  return { assignments, violations, fairnessScore };
}
