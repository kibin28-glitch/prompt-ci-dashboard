export interface EvalResult {
  pass: boolean;
  score: number;
  reason: string;
}

export interface CaseResult {
  input: Record<string, string>;
  baselineOutput: string;
  currentOutput: string;
  eval: EvalResult;
}

export interface RunResult {
  promptName: string;
  timestamp: string;
  threshold: number;
  cases: CaseResult[];
  passed: boolean;
}
