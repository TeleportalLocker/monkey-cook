export interface Step {
  id: string;
  name: string;
  type: 'step' | 'command' | 'prompt';
  description: string;
}

export interface StepCommand extends Step {
  type: 'command';
  command: string;
  autoCompleteOnSuccess: boolean;
}

export interface StepPrompt extends Step {
  type: 'prompt';
  prompt: string;
}

export interface Category {
  id: string;
  name: string;
  steps: (Step | StepCommand | StepPrompt)[];
}

export interface Workflow {
  id: string;
  name: string;
  categories: Category[];
}

/** Tâche = instance d'un workflow (ex: "New routes api" suit le workflow A) */
export interface WorkflowTask {
  id: string;
  name: string;
  workflowId: string;
  /** IDs des étapes marquées comme terminées pour cette tâche */
  completedStepIds: string[];
  /** IDs des étapes passées (skipped) pour cette tâche */
  skippedStepIds?: string[];
  /** IDs des étapes en erreur pour cette tâche */
  errorStepIds?: string[];
}

export interface WorkflowFile {
  workflows: Workflow[];
  /** Tâches lancées (instances de workflows) */
  tasks: WorkflowTask[];
  /** Workflow sélectionné pour édition (template) */
  activeWorkflowId?: string;
  /** Tâche sélectionnée pour suivi (si définie, on affiche la tâche, sinon le workflow) */
  activeTaskId?: string;
}