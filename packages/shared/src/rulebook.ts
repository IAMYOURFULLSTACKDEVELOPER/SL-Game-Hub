/** A rulebook section: bullet rules, optional numbered steps and tables */
export interface RuleTable {
  caption?: string;
  head: string[];
  rows: string[][];
}

export interface RuleSection {
  title: string;
  intro?: string;
  rules?: string[];
  steps?: string[];
  tables?: RuleTable[];
  note?: string;
}
