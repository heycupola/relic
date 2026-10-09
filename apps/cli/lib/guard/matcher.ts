export interface PatternMatch {
  patternIndex: number;
  start: number;
  end: number;
}

/**
 * Aho-Corasick automaton over UTF-16 code units. Finds every occurrence of every
 * pattern (including overlapping ones) in a single pass over the text.
 */
export class MultiPatternMatcher {
  private readonly transitions: Map<number, number>[] = [new Map()];
  private readonly fail: number[] = [0];
  private readonly outputs: number[][] = [[]];
  private readonly lengths: number[];

  constructor(patterns: readonly string[]) {
    this.lengths = patterns.map((p) => p.length);

    patterns.forEach((pattern, index) => {
      if (pattern.length === 0) return;
      let state = 0;
      for (let i = 0; i < pattern.length; i++) {
        const code = pattern.charCodeAt(i);
        let next = this.transitions[state]!.get(code);
        if (next === undefined) {
          next = this.transitions.length;
          this.transitions.push(new Map());
          this.fail.push(0);
          this.outputs.push([]);
          this.transitions[state]!.set(code, next);
        }
        state = next;
      }
      this.outputs[state]!.push(index);
    });

    const queue: number[] = [];
    for (const child of this.transitions[0]!.values()) {
      queue.push(child);
    }

    for (let head = 0; head < queue.length; head++) {
      const state = queue[head]!;
      for (const [code, child] of this.transitions[state]!) {
        queue.push(child);
        let fallback = this.fail[state]!;
        while (fallback !== 0 && !this.transitions[fallback]!.has(code)) {
          fallback = this.fail[fallback]!;
        }
        const target = this.transitions[fallback]!.get(code);
        this.fail[child] = target !== undefined && target !== child ? target : 0;
        const inherited = this.outputs[this.fail[child]!]!;
        if (inherited.length > 0) {
          this.outputs[child] = [...this.outputs[child]!, ...inherited];
        }
      }
    }
  }

  get isEmpty(): boolean {
    return this.transitions[0]!.size === 0;
  }

  findAll(text: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    if (this.isEmpty) return matches;

    let state = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      let next = this.transitions[state]!.get(code);
      while (next === undefined && state !== 0) {
        state = this.fail[state]!;
        next = this.transitions[state]!.get(code);
      }
      state = next ?? 0;

      const out = this.outputs[state]!;
      for (const patternIndex of out) {
        const length = this.lengths[patternIndex]!;
        matches.push({ patternIndex, start: i - length + 1, end: i + 1 });
      }
    }

    return matches;
  }
}
