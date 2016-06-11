'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
var jsforce = require('jsforce');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    var output = vscode.window.createOutputChannel("Information");
    var active = vscode.window.activeTextEditor;
    var Force = new ForceCaller(output, active);
    let disposable = vscode.commands.registerCommand('ForceCaller.connect', () => {
        // The code you place here will be executed every time your command is executed
        if(Force.org == ''){
            Force.connect();
        }
    });

    context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.commands.registerCommand('ForceCaller.getInfo', () => {
        // The code you place here will be executed every time your command is executed
        Force.getInfo();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCaller.getFile', () => {
        // The code you place here will be executed every time your command is executed
        Force.getFile();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCaller.saveFile', () => {
        // The code you place here will be executed every time your command is executed
        Force.saveFile();
    }));
    
}

/**
 * ForceCaller
 */
class ForceCaller {
    private output;
    private active;
    private salesforce;
    private checkStatusInterval;
    public org = '';

    constructor(output, active) {
        this.output = output;
        this.active = active;
        this.salesforce = new jsforce.Connection({
            // you can change loginUrl to connect to sandbox or prerelease env.
            loginUrl : 'https://test.salesforce.com'
        });
    }

    public connect(){
        var self = this;
        self.write('Connecting to salesforce....' + "\n");
        this.salesforce.login('adminblein@itesm.mx.test', 'tecmty01$', function(err, res) {
            if (err) { return console.error(err); }
            self.write("Conectado a la organizacion: "+res.organizationId + "\n");
            self.org = res.organizationId;
        });
    }
    
    public getFile()
    {
        var self = this;
        self.write("Org: " + self.org);
        console.log(self.active);
        console.log(self.active.document.uri.path);
        var fileName = self.active.document.uri.path.split('/');
        fileName = fileName[fileName.length - 1];
        var nameSplit = fileName.split('.');
        fileName = nameSplit[0];
        var ext = nameSplit[1];
        var apexType = (ext == 'cls') ? 'ApexClass' : ((ext == 'page') ? 'ApexPage' : 'ApexTrigger');
        this.salesforce.tooling.sobject(apexType)
        .find({ Name: fileName })
        .execute(function(err, records) {
            if (err) { return console.error(err); }
            console.log(records);
            console.log("fetched : " + records.length);
            for (var i=0; i < records.length; i++) {
            var record = records[i];
            console.log('Id: ' + record.Id);
            console.log('Name: ' + record.Name);
            }
        });
        
    }

    public saveFile()
    {
        var self = this;
        self.write("Org: " + self.org + '\n');
        console.log(self.active);
        var newBody = self.active.document.getText();
        var fileName = self.active.document.uri.path.split('/');
        fileName = fileName[fileName.length - 1];
        console.log(fileName);
        var nameSplit = fileName.split('.');
        fileName = nameSplit[0];
        var ext = nameSplit[1];
        var apexType = (ext == 'cls') ? 'ApexClass' : ((ext == 'page') ? 'ApexPage' : 'ApexTrigger');
        var apexMember = apexType+'Member';
        this.salesforce.tooling.sobject(apexType)
        .find({ Name: fileName })
        .execute(function(err, records) {
            if (err) { return console.error(err); }
            console.log(records);
            console.log("fetched : " + records.length);
            for (var i=0; i < records.length; i++) {
                var record = records[i];
                console.log('Name: ' + record.Name);
                /*self.salesforce.tooling.sobject('MetadataContainer').create({Name: 'SaveFromVsCode'+record.Id},function(err, res){
                    if (err) { self.write(err);return console.error(err); }
                    console.log(res);
                });*/
                self.salesforce.tooling.sobject(apexMember).create({
                    MetadataContainerId: '1dc17000000IDLhAAO',
                    ContentEntityId: record.Id,
                    Body: newBody
                },function(err, res){
                    if (err) { self.write(err);return console.error(err); }
                    console.log(res);
                    self.salesforce.tooling.sobject('ContainerAsyncRequest').create({
                        MetadataContainerId: '1dc17000000IDLhAAO',
                        isCheckOnly: false,
                    },function(err, res){
                        if (err) { self.write(err);return console.error(err); }else{
                            var async = res;
                            console.log(async);
                            self.write("Saving to Salesforce ....\n");
                            self.checkStatusInterval = setInterval(function(){
                                self.salesforce.tooling.sobject('ContainerAsyncRequest').retrieve(async.id, function(err, res){
                                    if (err) { self.write(err);return console.error(err); }else{
                                        if(res.State != 'Queued'){
                                            self.stopInterval();
                                            self.write("File Saved!!\n");
                                        }
                                        else{
                                            self.write("Waiting Salesforce response ....\n");
                                        }
                                    }                                                                      
                                });
                            }, 1000);
                        }
                    });
                });
            }
        });
        
    }

    public stopInterval(){
        clearInterval(this.checkStatusInterval);
    }

    public getInfo()
    {
        var self = this;
        self.write("Org: " + self.org + "\n");
        this.salesforce.tooling.describeGlobal(function(err, res) {
        if (err) { return console.error(err); }
            self.write('Num of tooling objects : ' + res.sobjects.length);
            console.log(res);
        })
        
    }
    
    public write(msg){
        this.output.append(msg);
        this.output.show();
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}