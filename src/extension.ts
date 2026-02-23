import * as vscode from 'vscode';
import { WorkflowStorage } from './storage';
import { WorkflowWebviewViewProvider } from './workflowWebviewView';
import { Workflow } from './models';
import { randomUUID } from 'crypto';

export function activate(context: vscode.ExtensionContext) {
  const storage = new WorkflowStorage(context);
  const webviewProvider = new WorkflowWebviewViewProvider(storage, context.extensionUri);

  // Enregistrement immédiat du fournisseur pour la vue (évite "Aucun fournisseur de données inscrit")
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('monkeyCookView', webviewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('monkey-cook.createWorkflow', async () => {
      const name = await vscode.window.showInputBox({ prompt: "Nom du workflow" });
      if (!name) {
        return;
      }

      const data = storage.load();

      const workflow: Workflow = {
        id: randomUUID(),
        name,
        categories: []
      };

      data.workflows.push(workflow);
      data.activeWorkflowId = workflow.id;
      data.activeTaskId = undefined;
      storage.save(data);
      webviewProvider.refresh();

      vscode.window.showInformationMessage(`Workflow « ${name} » créé et activé.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('monkey-cook.startWorkflow', async () => {
      const data = storage.load();

      const pick = await vscode.window.showQuickPick(
        data.workflows.map(w => w.name)
      );

      if (!pick) {
        return;
      }

      const workflow = data.workflows.find(w => w.name === pick);
      if (!workflow) {
        return;
      }

      data.activeWorkflowId = workflow.id;
      data.activeTaskId = undefined;
      storage.save(data);
      webviewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('monkey-cook.openWorkflowView', () => {
      vscode.commands.executeCommand('monkeyCookView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('monkey-cook.addCategory', async () => {
      const data = storage.load();
      if (data.activeTaskId) {
        vscode.window.showWarningMessage('En mode tâche, on ne modifie pas le workflow. Sélectionnez un workflow (pas une tâche) pour ajouter une catégorie.');
        return;
      }
      const active = data.workflows.find(w => w.id === data.activeWorkflowId);
      if (!active) {
        vscode.window.showWarningMessage('Aucun workflow actif. Créez-en un ou lancez-en un.');
        return;
      }
      const name = await vscode.window.showInputBox({ prompt: 'Nom de la catégorie' });
      if (!name) {return;}
      active.categories.push({
        id: randomUUID(),
        name,
        steps: []
      });
      storage.save(data);
      webviewProvider.refresh();
      vscode.window.showInformationMessage(`Catégorie « ${name} » ajoutée.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('monkey-cook.addStep', async (category: { id: string; name: string }) => {
      const data = storage.load();
      if (data.activeTaskId) { return; }
      const active = data.workflows.find(w => w.id === data.activeWorkflowId);
      if (!active) { return; }
      const cat = active.categories.find(c => c.id === category?.id);
      if (!cat) {return;}
      const name = await vscode.window.showInputBox({ prompt: 'Nom de l\'étape' });
      if (!name) {return;}
      cat.steps.push({
        id: randomUUID(),
        name,
        type: 'step',
        description: '',
      });
      storage.save(data);
      webviewProvider.refresh();
      vscode.window.showInformationMessage(`Étape « ${name} » ajoutée.`);
    })
  );
}

export function deactivate() {}