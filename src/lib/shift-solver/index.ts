// shift-solverモジュールの外部公開インターフェース。
// 外部（API Routeなど）からはgenerateShiftとその入出力の型だけを使う。
// greedy/localSearch/fairness/detectViolations等の内部実装は非公開のまま。

export { generateShift, type GenerateShiftOptions } from "./generateShift";

export type {
  Assignment,
  AssignmentKind,
  ConstraintViolation,
  Employee,
  EmploymentType,
  EmploymentTypeMinStaffing,
  EmploymentTypeWeekendMaxStaffing,
  ISODate,
  ShiftType,
  SolverInput,
  SolverOutput,
  StaffingRequirement,
  Weekday,
} from "./types";
