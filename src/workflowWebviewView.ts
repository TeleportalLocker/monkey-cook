import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { WorkflowStorage } from './storage';
import { Workflow, WorkflowTask, Step, StepCommand, StepPrompt } from './models';

export class WorkflowWebviewViewProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;

  constructor(
    private readonly storage: WorkflowStorage,
    private readonly extensionUri: vscode.Uri
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    this.setupMessageHandler(webviewView.webview);
    webviewView.onDidDispose(() => {
      this._view = undefined;
    });
  }

  refresh(): void {
    if (this._view?.visible) {
      const data = this.storage.load();
      this._view.webview.postMessage({
        type: 'update',
        workflows: data.workflows,
        tasks: data.tasks ?? [],
        activeWorkflowId: data.activeWorkflowId ?? '',
        activeTaskId: data.activeTaskId ?? '',
      });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const data = this.storage.load();
    const payload = {
      workflows: data.workflows,
      tasks: data.tasks ?? [],
      activeWorkflowId: data.activeWorkflowId ?? '',
      activeTaskId: data.activeTaskId ?? '',
    };
    const uiPath = path.join(__dirname, '..', 'ui', 'webview.html');
    const template = fs.readFileSync(uiPath, 'utf-8');
    const codiconCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.css')
    );
    return template
      .replace('{{INITIAL_DATA}}', JSON.stringify(payload))
      .replace('{{CODICON_CSS_URI}}', codiconCssUri.toString());
  }

  private setupMessageHandler(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (msg: { type: string; stepId?: string; status?: string; workflowId?: string; taskId?: string; categoryId?: string }) => {
      const data = this.storage.load();
      switch (msg.type) {
        case 'setStepStatus':
          if (msg.stepId && msg.status && data.activeTaskId) {
            const task = data.tasks?.find(t => t.id === data.activeTaskId);
            if (task) {
              const completed = task.completedStepIds ?? [];
              const skipped = task.skippedStepIds ?? [];
              const idx = completed.indexOf(msg.stepId);
              const skipIdx = skipped.indexOf(msg.stepId);
              const errorIds = task.errorStepIds ?? [];
              const errIdx = errorIds.indexOf(msg.stepId);
              if (msg.status === 'completed') {
                if (idx < 0) { completed.push(msg.stepId); }
                if (skipIdx >= 0) { skipped.splice(skipIdx, 1); }
                if (errIdx >= 0) { errorIds.splice(errIdx, 1); }
              } else if (msg.status === 'cancelled') {
                if (idx >= 0) { completed.splice(idx, 1); }
                if (skipIdx >= 0) { skipped.splice(skipIdx, 1); }
                if (errIdx >= 0) { errorIds.splice(errIdx, 1); }
              } else if (msg.status === 'skipped') {
                if (idx >= 0) { completed.splice(idx, 1); }
                if (skipIdx < 0) { skipped.push(msg.stepId); }
                if (errIdx >= 0) { errorIds.splice(errIdx, 1); }
              } else if (msg.status === 'error') {
                if (idx >= 0) { completed.splice(idx, 1); }
                if (skipIdx >= 0) { skipped.splice(skipIdx, 1); }
                if (errIdx < 0) { errorIds.push(msg.stepId); }
              }
              task.completedStepIds = completed;
              task.skippedStepIds = skipped.length ? skipped : undefined;
              task.errorStepIds = errorIds.length ? errorIds : undefined;
              this.storage.save(data);
            }
          }
          break;
        case 'setActiveWorkflow':
          if (msg.workflowId) {
            data.activeWorkflowId = msg.workflowId;
            data.activeTaskId = undefined;
            this.storage.save(data);
          }
          break;
        case 'setActiveTask':
          if (msg.taskId) {
            const task = data.tasks?.find(t => t.id === msg.taskId);
            if (task) {
              data.activeTaskId = task.id;
              data.activeWorkflowId = task.workflowId;
              this.storage.save(data);
            }
          }
          break;
        case 'launchWorkflow': {
          const workflows = data.workflows ?? [];
          if (workflows.length === 0) {
            vscode.window.showWarningMessage('Créez d\'abord un workflow.');
            break;
          }
          const pick = await vscode.window.showQuickPick(
            workflows.map(w => ({ label: w.name, workflow: w })),
            { title: 'Choisir le workflow à lancer', matchOnDescription: true }
          );
          if (!pick) { break; }
          const taskName = await vscode.window.showInputBox({
            prompt: 'Nom de la tâche (ex: New routes api)',
            title: 'Nouvelle tâche',
            value: '',
          });
          if (!taskName?.trim()) { break; }
          const newTask: WorkflowTask = {
            id: randomUUID(),
            name: taskName.trim(),
            workflowId: pick.workflow.id,
            completedStepIds: [],
          };
          if (!data.tasks) { data.tasks = []; }
          data.tasks.push(newTask);
          data.activeTaskId = newTask.id;
          data.activeWorkflowId = pick.workflow.id;
          this.storage.save(data);
          vscode.window.showInformationMessage(`Tâche « ${newTask.name} » créée (workflow ${pick.workflow.name}).`);
          break;
        }
        case 'createWorkflow': {
          const name = await vscode.window.showInputBox({ prompt: 'Nom du workflow', title: 'Nouveau workflow' });
          if (!name) { break; }
          const workflow: Workflow = {
            id: randomUUID(),
            name,
            categories: [],
          };
          data.workflows.push(workflow);
          data.activeWorkflowId = workflow.id;
          this.storage.save(data);
          vscode.window.showInformationMessage(`Workflow « ${name} » créé.`);
          break;
        }
        case 'addCategory': {
          if (data.activeTaskId) { break; }
          const active = data.workflows.find(w => w.id === data.activeWorkflowId);
          if (!active) {
            vscode.window.showWarningMessage('Sélectionnez ou créez un workflow d\'abord.');
            break;
          }
          const name = await vscode.window.showInputBox({ prompt: 'Nom de la catégorie', title: 'Nouvelle catégorie' });
          if (!name) { break; }
          active.categories.push({ id: randomUUID(), name, steps: [] });
          this.storage.save(data);
          vscode.window.showInformationMessage(`Catégorie « ${name} » ajoutée.`);
          break;
        }
        case 'addStep': {
          if (data.activeTaskId) { break; }
          const active = data.workflows.find(w => w.id === data.activeWorkflowId);
          const cat = active?.categories.find(c => c.id === msg.categoryId);
          if (!cat) {
            vscode.window.showWarningMessage('Catégorie introuvable.');
            break;
          }
          const name = await vscode.window.showInputBox({ prompt: 'Nom de l\'étape', title: 'Nouvelle étape' });
          if (!name) { break; }
          cat.steps.push({ id: randomUUID(), name, type: 'step', description: '' });
          this.storage.save(data);
          vscode.window.showInformationMessage(`Étape « ${name} » ajoutée.`);
          break;
        }
        case 'editStep': {
          if (data.activeTaskId) { break; }
          const active = data.workflows.find(w => w.id === data.activeWorkflowId);
          const cat = active?.categories.find(c => c.id === msg.categoryId);
          const step = cat?.steps.find(s => s.id === msg.stepId);
          if (!cat || !step) {
            vscode.window.showWarningMessage('Étape ou catégorie introuvable.');
            break;
          }
          const name = await vscode.window.showInputBox({ prompt: 'Nom de l\'étape', title: 'Modifier l\'étape', value: step.name });
          if (name === undefined || name === null) { break; }
          step.name = name;
          const description = await vscode.window.showInputBox({ prompt: 'Description (optionnel)', title: 'Description', value: step.description });
          if (description !== undefined && description !== null) { step.description = description; }
          const typePick = await vscode.window.showQuickPick(
            [
              { label: 'Étape simple', value: 'step' as const },
              { label: 'Commande (exécutable)', value: 'command' as const },
              { label: 'Prompt (exécutable)', value: 'prompt' as const },
            ],
            { title: 'Type d\'étape', placeHolder: 'Choisir le type' }
          );
          if (typePick === undefined || typePick === null) { this.storage.save(data); break; }
          if (typePick.value === 'command') {
            const cmd = await vscode.window.showInputBox({
              prompt: 'Commande à exécuter dans le terminal (ex: npm version patch)',
              title: 'Commande',
              value: (step as StepCommand).command ?? '',
            });
            if (cmd !== undefined && cmd !== null) {
              const existing = step as Partial<StepCommand>;
              cat.steps[cat.steps.indexOf(step)] = {
                ...step,
                type: 'command',
                command: cmd,
                autoCompleteOnSuccess: existing.autoCompleteOnSuccess ?? false,
              } as StepCommand;
            }
          } else if (typePick.value === 'prompt') {
            const promptText = await vscode.window.showInputBox({
              prompt: 'Texte du prompt à envoyer (ex: Explique ce fichier)',
              title: 'Prompt',
              value: (step as StepPrompt).prompt ?? '',
            });
            if (promptText !== undefined && promptText !== null) {
              cat.steps[cat.steps.indexOf(step)] = {
                ...step,
                type: 'prompt',
                prompt: promptText,
              } as StepPrompt;
            }
          } else {
            const idx = cat.steps.indexOf(step);
            cat.steps[idx] = { id: step.id, name: step.name, description: step.description, type: 'step' };
          }
          this.storage.save(data);
          vscode.window.showInformationMessage('Étape mise à jour.');
          break;
        }
        case 'testStepCommand': {
          if (data.activeTaskId) { break; }
          const wf = data.workflows.find(w => w.id === data.activeWorkflowId);
          let stepToTest: StepCommand | undefined;
          for (const c of wf?.categories ?? []) {
            const s = c.steps.find(st => st.id === msg.stepId && st.type === 'command');
            if (s) { stepToTest = s as StepCommand; break; }
          }
          if (!stepToTest?.command?.trim()) {
            vscode.window.showWarningMessage('Aucune commande à tester.');
            break;
          }
          const exe = stepToTest.command.trim().split(/\s+/)[0];
          if (!exe) {
            vscode.window.showWarningMessage('Commande vide.');
            break;
          }
          const isWin = process.platform === 'win32';
          try {
            const cmd = isWin ? `where "${exe}"` : `command -v ${exe}`;
            const out = execSync(cmd, { encoding: 'utf8', timeout: 2000 });
            const resolved = (out || '').trim().split(/\r?\n/)[0] || exe;
            vscode.window.showInformationMessage(`Commande trouvée: ${resolved}`);
          } catch {
            vscode.window.showWarningMessage(`Commande introuvable: ${exe}`);
          }
          break;
        }
        case 'executeStep': {
          const workflow = data.activeTaskId
            ? (data.workflows ?? []).find(w => w.id === (data.tasks?.find(t => t.id === data.activeTaskId)?.workflowId))
            : data.workflows.find(w => w.id === data.activeWorkflowId);
          let step: Step | StepCommand | StepPrompt | undefined;
          for (const c of workflow?.categories ?? []) {
            step = c.steps.find(s => s.id === msg.stepId);
            if (step) { break; }
          }
          if (!step) {
            vscode.window.showWarningMessage('Étape introuvable.');
            break;
          }
          if (step.type === 'command') {
            const cmd = (step as StepCommand).command?.trim();
            if (!cmd) {
              vscode.window.showWarningMessage('Aucune commande définie pour cette étape.');
              break;
            }
            const terminal = vscode.window.createTerminal({ name: 'Workflow: ' + step.name });
            terminal.show();
            terminal.sendText(cmd);
            vscode.window.showInformationMessage('Commande envoyée au terminal: ' + cmd);
          } else if (step.type === 'prompt') {
            const promptText = (step as StepPrompt).prompt;
            await vscode.env.clipboard.writeText(promptText);
            const openChat = await vscode.window.showInformationMessage(
              `Prompt copié: « ${promptText.slice(0, 50)}${promptText.length > 50 ? '…' : ''} ». Collez-le dans le chat (Ctrl+V).`,
              'Ouvrir le chat'
            );
            if (openChat === 'Ouvrir le chat') {
              await vscode.commands.executeCommand('aichat.open');
            }
          } else {
            vscode.window.showInformationMessage('Cette étape n\'est pas exécutable (type simple).');
          }
          break;
        }
        case 'deleteStep': {
          if (data.activeTaskId) { break; }
          const active = data.workflows.find(w => w.id === data.activeWorkflowId);
          const cat = active?.categories.find(c => c.id === msg.categoryId);
          if (!cat || !msg.stepId) {
            vscode.window.showWarningMessage('Étape ou catégorie introuvable.');
            break;
          }
          const stepIdx = cat.steps.findIndex(s => s.id === msg.stepId);
          if (stepIdx < 0) { break; }
          cat.steps.splice(stepIdx, 1);
          this.storage.save(data);
          vscode.window.showInformationMessage('Étape supprimée.');
          break;
        }
        case 'deleteCategory': {
          if (data.activeTaskId) { break; }
          const active = data.workflows.find(w => w.id === data.activeWorkflowId);
          if (!active) {
            vscode.window.showWarningMessage('Workflow introuvable.');
            break;
          }
          const catIdx = active.categories.findIndex(c => c.id === msg.categoryId);
          if (catIdx < 0) {
            vscode.window.showWarningMessage('Catégorie introuvable.');
            break;
          }
          active.categories.splice(catIdx, 1);
          this.storage.save(data);
          vscode.window.showInformationMessage('Catégorie supprimée.');
          break;
        }
        case 'deleteWorkflow': {
          if (!msg.workflowId) { break; }
          const wfIdx = data.workflows.findIndex(w => w.id === msg.workflowId);
          if (wfIdx < 0) {
            vscode.window.showWarningMessage('Workflow introuvable.');
            break;
          }
          data.workflows.splice(wfIdx, 1);
          if (data.activeWorkflowId === msg.workflowId) {
            data.activeWorkflowId = undefined;
            data.activeTaskId = undefined;
          }
          this.storage.save(data);
          vscode.window.showInformationMessage('Workflow supprimé.');
          break;
        }
        case 'deleteTask': {
          if (!msg.taskId) { break; }
          const tasks = data.tasks ?? [];
          const taskIdx = tasks.findIndex(t => t.id === msg.taskId);
          if (taskIdx < 0) {
            vscode.window.showWarningMessage('Tâche introuvable.');
            break;
          }
          data.tasks.splice(taskIdx, 1);
          if (data.activeTaskId === msg.taskId) {
            data.activeTaskId = undefined;
            data.activeWorkflowId = data.workflows.length > 0 ? data.workflows[0].id : undefined;
          }
          this.storage.save(data);
          vscode.window.showInformationMessage('Tâche supprimée.');
          break;
        }
      }
      this.refresh();
    });
  }
}

