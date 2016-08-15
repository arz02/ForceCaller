'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import ForceCaller from './ForceCaller';
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    var output = vscode.window.createOutputChannel("Information");
    var window = vscode.window;
    var workspace = vscode.workspace;
    var Force = new ForceCaller(output, window, workspace);
    let disposable = vscode.commands.registerCommand('ForceCaller.connect', () => {
        // The code you place here will be executed every time your command is executed
        if(Force.org == ''){
            Force.connect(null);
        }
    });

    context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.commands.registerCommand('ForceCaller.saveFile', () => {
        // The code you place here will be executed every time your command is executed
        Force.save();
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('ForceCaller.createContainer', () => {
        // The code you place here will be executed every time your command is executed
        Force.createMetadataContainer(null);
    }));
    
}

// this method is called when your extension is deactivated
export function deactivate() {
}