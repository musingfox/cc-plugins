/**
 * Observation Logger
 *
 * Records user decisions and agent execution patterns for future automation.
 * Phase 1: Collect data with human decision points
 * Phase 2: Analyze patterns and suggest automation
 * Phase 3: Auto-execute common patterns with confirmation
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Observation record for a single decision point
 */
export interface ObservationRecord {
  // Metadata
  timestamp: string;
  session_id?: string;
  task_id: string;

  // Context
  phase: 'planning' | 'execution' | 'review';
  coordinator: string;  // Which coordinator made the decision
  task_type?: 'feature' | 'bug' | 'refactor' | 'other';
  task_complexity?: number;

  // Decision
  decision_point: string;  // What was being decided
  options_presented: string[];  // What options were shown
  option_chosen: string;  // What user chose
  was_recommended: boolean;  // Was this the recommended option?

  // Project Context
  project_preferences?: {
    development_style?: string;  // TDD, impl-first, etc
    test_framework?: string;
    language?: string;
  };

  // Outcome
  planning_agents_used?: string[];  // Which planning agents ran before this
  execution_agent_chosen?: string;  // Which execution agent was selected
  additional_agents?: string[];  // What agents were added after primary
  went_to_next_phase?: boolean;  // Did user proceed to next phase?

  // Performance
  agent_duration_ms?: number;
  tokens_used?: number;
  success?: boolean;
  error_message?: string;
}

/**
 * Aggregated statistics from observations
 */
export interface ObservationStats {
  total_observations: number;
  date_range: {
    earliest: string;
    latest: string;
  };

  // Execution Agent Selection
  execution_agent_frequency: Record<string, number>;
  execution_agent_by_task_type: Record<string, Record<string, number>>;

  // Recommendation Follow Rate
  recommendation_follow_rate: number;
  follow_rate_by_coordinator: Record<string, number>;

  // Common Sequences
  common_agent_sequences: Array<{
    sequence: string[];
    frequency: number;
    avg_complexity: number;
  }>;

  // Post-Execution Patterns
  post_execution_additions: Record<string, string[]>;  // primary_agent -> [additional_agents]

  // Phase Transitions
  phase_transition_rate: {
    planning_to_execution: number;
    execution_to_review: number;
    execution_continue: number;
  };
}

/**
 * Automation suggestion based on observation patterns
 */
export interface AutomationSuggestion {
  pattern: string;
  description: string;
  frequency: number;
  confidence: number;  // 0-1
  implementation: string;  // How to automate this
  phase: 2 | 3;  // Which phase to implement in
}

export class ObservationLogger {
  private observationsPath: string;

  constructor(workspaceRoot: string) {
    this.observationsPath = path.join(workspaceRoot, '.agents', 'observations.jsonl');
  }

  /**
   * Record a new observation
   */
  async record(observation: ObservationRecord): Promise<void> {
    // Ensure .agents directory exists
    const dir = path.dirname(this.observationsPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Add timestamp if not provided
    if (!observation.timestamp) {
      observation.timestamp = new Date().toISOString();
    }

    // Append to JSONL file (one JSON per line)
    const line = JSON.stringify(observation) + '\n';
    await fs.promises.appendFile(this.observationsPath, line, 'utf-8');
  }

  /**
   * Read all observations
   */
  async readAll(): Promise<ObservationRecord[]> {
    try {
      const content = await fs.promises.readFile(this.observationsPath, 'utf-8');
      const lines = content.trim().split('\n');
      return lines.map(line => JSON.parse(line));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read observations with filter
   */
  async readFiltered(filter: {
    phase?: string;
    coordinator?: string;
    task_type?: string;
    since?: string;  // ISO timestamp
  }): Promise<ObservationRecord[]> {
    const all = await this.readAll();

    return all.filter(obs => {
      if (filter.phase && obs.phase !== filter.phase) return false;
      if (filter.coordinator && obs.coordinator !== filter.coordinator) return false;
      if (filter.task_type && obs.task_type !== filter.task_type) return false;
      if (filter.since && obs.timestamp < filter.since) return false;
      return true;
    });
  }

  /**
   * Generate statistics from observations
   */
  async generateStats(): Promise<ObservationStats> {
    const observations = await this.readAll();

    if (observations.length === 0) {
      throw new Error('No observations found');
    }

    // Sort by timestamp
    const sorted = observations.sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    // Execution agent frequency
    const execAgentFreq: Record<string, number> = {};
    const execAgentByTaskType: Record<string, Record<string, number>> = {};

    for (const obs of observations) {
      if (obs.execution_agent_chosen) {
        execAgentFreq[obs.execution_agent_chosen] =
          (execAgentFreq[obs.execution_agent_chosen] || 0) + 1;

        if (obs.task_type) {
          if (!execAgentByTaskType[obs.task_type]) {
            execAgentByTaskType[obs.task_type] = {};
          }
          execAgentByTaskType[obs.task_type][obs.execution_agent_chosen] =
            (execAgentByTaskType[obs.task_type][obs.execution_agent_chosen] || 0) + 1;
        }
      }
    }

    // Recommendation follow rate
    const withRecommendation = observations.filter(o => o.was_recommended !== undefined);
    const followed = withRecommendation.filter(o => o.was_recommended);
    const followRate = withRecommendation.length > 0
      ? followed.length / withRecommendation.length
      : 0;

    // Follow rate by coordinator
    const followRateByCoord: Record<string, number> = {};
    const coordinators = [...new Set(observations.map(o => o.coordinator))];

    for (const coord of coordinators) {
      const coordObs = observations.filter(o => o.coordinator === coord);
      const coordWithRec = coordObs.filter(o => o.was_recommended !== undefined);
      const coordFollowed = coordWithRec.filter(o => o.was_recommended);

      followRateByCoord[coord] = coordWithRec.length > 0
        ? coordFollowed.length / coordWithRec.length
        : 0;
    }

    // Common agent sequences
    const sequences: Record<string, { count: number; complexities: number[] }> = {};

    for (const obs of observations) {
      if (obs.execution_agent_chosen) {
        const seq = [
          ...(obs.planning_agents_used || []),
          obs.execution_agent_chosen,
          ...(obs.additional_agents || [])
        ];
        const key = seq.join(' → ');

        if (!sequences[key]) {
          sequences[key] = { count: 0, complexities: [] };
        }

        sequences[key].count++;
        if (obs.task_complexity) {
          sequences[key].complexities.push(obs.task_complexity);
        }
      }
    }

    const commonSequences = Object.entries(sequences)
      .map(([seqStr, data]) => ({
        sequence: seqStr.split(' → '),
        frequency: data.count,
        avg_complexity: data.complexities.length > 0
          ? data.complexities.reduce((a, b) => a + b, 0) / data.complexities.length
          : 0
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Post-execution additions
    const postExecAdditions: Record<string, string[]> = {};

    for (const obs of observations) {
      if (obs.execution_agent_chosen && obs.additional_agents && obs.additional_agents.length > 0) {
        if (!postExecAdditions[obs.execution_agent_chosen]) {
          postExecAdditions[obs.execution_agent_chosen] = [];
        }
        postExecAdditions[obs.execution_agent_chosen].push(...obs.additional_agents);
      }
    }

    // Phase transitions
    const wentToNextPhase = observations.filter(o => o.went_to_next_phase);
    const total = observations.length;

    const planningPhase = observations.filter(o => o.phase === 'planning');
    const executionPhase = observations.filter(o => o.phase === 'execution');

    return {
      total_observations: observations.length,
      date_range: {
        earliest: sorted[0].timestamp,
        latest: sorted[sorted.length - 1].timestamp
      },
      execution_agent_frequency: execAgentFreq,
      execution_agent_by_task_type: execAgentByTaskType,
      recommendation_follow_rate: followRate,
      follow_rate_by_coordinator: followRateByCoord,
      common_agent_sequences: commonSequences,
      post_execution_additions: postExecAdditions,
      phase_transition_rate: {
        planning_to_execution: planningPhase.length > 0
          ? planningPhase.filter(o => o.went_to_next_phase).length / planningPhase.length
          : 0,
        execution_to_review: executionPhase.length > 0
          ? executionPhase.filter(o => o.went_to_next_phase).length / executionPhase.length
          : 0,
        execution_continue: executionPhase.length > 0
          ? executionPhase.filter(o => !o.went_to_next_phase).length / executionPhase.length
          : 0
      }
    };
  }

  /**
   * Generate automation suggestions based on patterns
   */
  async generateSuggestions(): Promise<AutomationSuggestion[]> {
    const stats = await this.generateStats();
    const suggestions: AutomationSuggestion[] = [];

    // Suggestion 1: Auto-suggest execution agent based on task type
    for (const [taskType, agents] of Object.entries(stats.execution_agent_by_task_type)) {
      const total = Object.values(agents).reduce((sum, count) => sum + count, 0);
      const mostCommon = Object.entries(agents).sort((a, b) => b[1] - a[1])[0];

      if (mostCommon && mostCommon[1] / total >= 0.7) {  // 70% threshold
        suggestions.push({
          pattern: `${taskType} tasks → @${mostCommon[0]}`,
          description: `${Math.round(mostCommon[1] / total * 100)}% of ${taskType} tasks use @${mostCommon[0]}`,
          frequency: mostCommon[1],
          confidence: mostCommon[1] / total,
          implementation: `In @coord-exec: if task_type === '${taskType}', auto-recommend @${mostCommon[0]}`,
          phase: 2
        });
      }
    }

    // Suggestion 2: Auto-add agents after primary execution
    for (const [primaryAgent, additions] of Object.entries(stats.post_execution_additions)) {
      const additionFreq: Record<string, number> = {};

      for (const agent of additions) {
        additionFreq[agent] = (additionFreq[agent] || 0) + 1;
      }

      const totalPrimary = stats.execution_agent_frequency[primaryAgent] || 0;

      for (const [addAgent, count] of Object.entries(additionFreq)) {
        if (count / totalPrimary >= 0.7) {  // 70% threshold
          suggestions.push({
            pattern: `@${primaryAgent} → @${addAgent}`,
            description: `${Math.round(count / totalPrimary * 100)}% of @${primaryAgent} completions add @${addAgent}`,
            frequency: count,
            confidence: count / totalPrimary,
            implementation: `After @${primaryAgent} completes, auto-suggest @${addAgent}`,
            phase: 2
          });
        }
      }
    }

    // Suggestion 3: Common sequences (for Phase 3 full automation)
    for (const seq of stats.common_agent_sequences.slice(0, 3)) {
      if (seq.frequency >= 5) {  // At least 5 occurrences
        suggestions.push({
          pattern: seq.sequence.join(' → '),
          description: `Common workflow executed ${seq.frequency} times (avg complexity: ${seq.avg_complexity.toFixed(1)})`,
          frequency: seq.frequency,
          confidence: seq.frequency / stats.total_observations,
          implementation: `Create workflow agent that auto-executes: ${seq.sequence.join(' → ')}`,
          phase: 3
        });
      }
    }

    // Suggestion 4: High recommendation follow rate
    if (stats.recommendation_follow_rate >= 0.8) {
      suggestions.push({
        pattern: 'User follows recommendations',
        description: `${Math.round(stats.recommendation_follow_rate * 100)}% follow rate suggests recommendations are accurate`,
        frequency: Math.round(stats.total_observations * stats.recommendation_follow_rate),
        confidence: stats.recommendation_follow_rate,
        implementation: 'Increase automation: auto-select recommended options with confirmation',
        phase: 2
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Format statistics for human-readable output
   */
  static formatStats(stats: ObservationStats): string {
    const lines: string[] = [];

    lines.push('# Observation Statistics\n');
    lines.push(`Total Observations: ${stats.total_observations}`);
    lines.push(`Date Range: ${stats.date_range.earliest} to ${stats.date_range.latest}\n`);

    lines.push('## Execution Agent Frequency\n');
    const sortedAgents = Object.entries(stats.execution_agent_frequency)
      .sort((a, b) => b[1] - a[1]);

    for (const [agent, count] of sortedAgents) {
      const pct = Math.round(count / stats.total_observations * 100);
      lines.push(`- @${agent}: ${count} times (${pct}%)`);
    }

    lines.push('\n## Execution Agent by Task Type\n');
    for (const [taskType, agents] of Object.entries(stats.execution_agent_by_task_type)) {
      lines.push(`\n### ${taskType}`);
      const total = Object.values(agents).reduce((sum, count) => sum + count, 0);

      for (const [agent, count] of Object.entries(agents)) {
        const pct = Math.round(count / total * 100);
        lines.push(`- @${agent}: ${count} times (${pct}%)`);
      }
    }

    lines.push('\n## Recommendation Follow Rate\n');
    lines.push(`Overall: ${Math.round(stats.recommendation_follow_rate * 100)}%`);
    lines.push('\nBy Coordinator:');

    for (const [coord, rate] of Object.entries(stats.follow_rate_by_coordinator)) {
      lines.push(`- @${coord}: ${Math.round(rate * 100)}%`);
    }

    lines.push('\n## Common Agent Sequences\n');
    for (const seq of stats.common_agent_sequences) {
      lines.push(`- ${seq.sequence.join(' → ')}: ${seq.frequency} times (avg complexity: ${seq.avg_complexity.toFixed(1)})`);
    }

    lines.push('\n## Post-Execution Additions\n');
    for (const [primary, additions] of Object.entries(stats.post_execution_additions)) {
      const additionFreq: Record<string, number> = {};
      for (const agent of additions) {
        additionFreq[agent] = (additionFreq[agent] || 0) + 1;
      }

      lines.push(`\n### After @${primary}:`);
      for (const [agent, count] of Object.entries(additionFreq)) {
        lines.push(`- @${agent}: ${count} times`);
      }
    }

    lines.push('\n## Phase Transition Rate\n');
    lines.push(`- Planning → Execution: ${Math.round(stats.phase_transition_rate.planning_to_execution * 100)}%`);
    lines.push(`- Execution → Review: ${Math.round(stats.phase_transition_rate.execution_to_review * 100)}%`);
    lines.push(`- Execution Continue: ${Math.round(stats.phase_transition_rate.execution_continue * 100)}%`);

    return lines.join('\n');
  }

  /**
   * Format suggestions for human-readable output
   */
  static formatSuggestions(suggestions: AutomationSuggestion[]): string {
    const lines: string[] = [];

    lines.push('# Automation Suggestions\n');

    const phase2 = suggestions.filter(s => s.phase === 2);
    const phase3 = suggestions.filter(s => s.phase === 3);

    if (phase2.length > 0) {
      lines.push('## Phase 2: Semi-Automated (Auto-suggest with confirmation)\n');

      for (const sug of phase2) {
        lines.push(`### ${sug.pattern}`);
        lines.push(`- **Description**: ${sug.description}`);
        lines.push(`- **Frequency**: ${sug.frequency} occurrences`);
        lines.push(`- **Confidence**: ${Math.round(sug.confidence * 100)}%`);
        lines.push(`- **Implementation**: ${sug.implementation}\n`);
      }
    }

    if (phase3.length > 0) {
      lines.push('## Phase 3: Highly Automated (Auto-execute with breakpoints)\n');

      for (const sug of phase3) {
        lines.push(`### ${sug.pattern}`);
        lines.push(`- **Description**: ${sug.description}`);
        lines.push(`- **Frequency**: ${sug.frequency} occurrences`);
        lines.push(`- **Confidence**: ${Math.round(sug.confidence * 100)}%`);
        lines.push(`- **Implementation**: ${sug.implementation}\n`);
      }
    }

    if (suggestions.length === 0) {
      lines.push('No automation suggestions yet. Need more observation data (minimum ~10-20 observations).');
    }

    return lines.join('\n');
  }
}
