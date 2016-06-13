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
    var workspace = vscode.workspace;
    var Force = new ForceCaller(output, active, workspace);
    let disposable = vscode.commands.registerCommand('ForceCaller.connect', () => {
        // The code you place here will be executed every time your command is executed
        if(Force.org == ''){
            Force.connect();
        }
    });

    context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.commands.registerCommand('ForceCaller.saveFile', () => {
        // The code you place here will be executed every time your command is executed
        Force.saveFile();
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('ForceCaller.createContainer', () => {
        // The code you place here will be executed every time your command is executed
        Force.createMetadataContainer();
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
    private workspace;
    private metadataContainer;
    public org = '';

    constructor(output, active, workspace) {
        this.output = output;
        this.active = active;
        this.workspace = workspace;
        var setting = workspace.getConfiguration("ForceCaller.setting");
        this.salesforce = new jsforce.Connection({
            // you can change loginUrl to connect to sandbox or prerelease env.
            loginUrl : setting.get("host")
        });
    }

    public connect(){
        var self = this;
        var setting = self.workspace.getConfiguration("ForceCaller.setting");
        self.write('Connecting to salesforce at '+setting.get("host")+' ....' + "\n");
        this.salesforce.login(setting.get('user'), setting.get('password'), function(err, res) {
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
        var setting = self.workspace.getConfiguration("ForceCaller.setting");
        var metadataContainerId = setting.get('MetadataContainer');
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
                self.salesforce.tooling.sobject(apexMember).create({
                    MetadataContainerId: metadataContainerId,
                    ContentEntityId: record.Id,
                    Body: newBody
                },function(err, res){
                    if (err) { self.write('Error at '+apexMember+'\n');console.error('Error at '+apexMember+'\n' );return console.error(err); }else{
                        console.log(err);
                        console.log(res);
                        self.salesforce.tooling.sobject('ContainerAsyncRequest').create({
                            MetadataContainerId: metadataContainerId,
                            isCheckOnly: false,
                        },function(err, res){
                            if (err) { self.write('Error at creating ContainerAsyncRequest\n');console.error('Error at creating ContainerAsyncRequest\n' );return console.log(err); }else{
                                var async = res;
                                console.log(async);
                                self.write("Saving to Salesforce file '"+fileName+"."+ext+"'....\n");
                                self.checkAsyncStatus(async.id);
                            }
                        });
                    }
                });
            }
        });
    }
    
    public checkAsyncStatus(AsyncId){
        var self = this;
        self.write("Waiting Salesforce response ....\n");
        self.salesforce.tooling.sobject('ContainerAsyncRequest').retrieve(AsyncId, function(err, res){                                    
            if (err) { self.write('Error at retrieve ContainerAsyncRequest\n' );console.error('Error at retrieve ContainerAsyncRequest\n' );return console.log(err); }else{
                if(res.State != 'Queued'){
                    console.log("Estado del guardado: ");
                    console.log(res);
                    if(res.ErrorMsg != null){
                        self.write(res.ErrorMsg + "\n");                                                
                    }
                    else{
                        if(res.State == 'Failed'){
                            var messages = res.DeployDetails.componentFailures;
                            for(var i = 0; i < messages.length; i++){
                                var msg = messages[i];
                                self.write("**** There is an error with the " + msg.componentType + " " + "'" + msg.fullName + "' at" + "\n");
                                self.write("**** Line Number: " + msg.lineNumber + ", column: " + msg.columnNumber + "\n");
                                self.write("**** Error Msg: " + msg.problem + "\n");
                            }
                        }
                        else{
                            self.write("File Saved!!\n");    
                        }                            
                    }                                            
                }
                else{
                    self.checkAsyncStatus(AsyncId);
                }
            }                                                                      
        });
    }
    
    public createMetadataContainer(){
        var self = this;
        self.salesforce.tooling.sobject('MetadataContainer')
        .find({ Name: 'SaveFromVsCode' })
        .execute(function(err, records) {
            if (err) { return console.error(err); }
            console.log(records);
            console.log("fetched : " + records.length);
            if(records.length > 0) {
                self.deleteMetadataContainer();
                self.createContainer();
            }
            else{
                self.createContainer();
            }
        });
    }
    
    public createContainer(){
        var self = this;
        self.salesforce.tooling.sobject('MetadataContainer').create({Name: 'SaveFromVsCode'},function(err, res){
            if (err) { self.write("There was an error creating the MetadataContainer\n");return console.error(err); }
            console.log(res);
            self.write("Creado contenedor: "+res.id + "\n\n");
        });
    }
    
    public deleteMetadataContainer(){
        var self = this;
        var setting = self.workspace.getConfiguration("ForceCaller.setting");
        self.salesforce.tooling.sobject('MetadataContainer').delete(setting.get('MetadataContainer'),function(err, res){
            if (err) { self.write("There was an error deleting the MetadataContainer\n");return console.error(err); }
            console.log(res);
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