import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowFile, Step, StepCommand, StepPrompt } from './models';

function normalizeStep(s: Partial<Step>): Step | StepCommand | StepPrompt {
  const type = s.type ?? 'step';
  const base = { id: s.id!, name: s.name ?? '', description: s.description ?? '', type };
  if (type === 'command') {
    const sc = s as Partial<StepCommand>;
    return { ...base, type: 'command', command: sc.command ?? '', autoCompleteOnSuccess: sc.autoCompleteOnSuccess ?? true };
  }
  if (type === 'prompt') {
    const sp = s as Partial<StepPrompt>;
    return { ...base, type: 'prompt', prompt: sp.prompt ?? '' };
  }
  return { ...base, type: 'step' };
}

export class WorkflowStorage {
  private filePath: string;

  constructor(context: vscode.ExtensionContext) {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (workspace) {
      this.filePath = path.join(workspace.uri.fsPath, '.monkey-cook.json');
    } else {
      this.filePath = path.join(context.globalStoragePath, 'monkey-cook.json');
    }
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      this.save({ workflows: [], tasks: [] });
    }
  }

  load(): WorkflowFile {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WorkflowFile>;
    const workflows = (parsed.workflows ?? []).map(w => ({
      ...w,
      categories: (w.categories ?? []).map(c => ({
        ...c,
        steps: (c.steps ?? []).map(s => normalizeStep(s)),
      })),
    }));
    return {
      workflows,
      tasks: parsed.tasks ?? [],
      activeWorkflowId: parsed.activeWorkflowId,
      activeTaskId: parsed.activeTaskId,
    };
  }

  save(data: WorkflowFile) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}