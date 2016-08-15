'use strict';
var jsforce = require('jsforce');

/**
 * ForceCaller
 */
export default class ForceCaller {
    private output;
    private window;
    private salesforce;
    private workspace;
    private metadataContainer;
    public org = '';
    private containerId = '';

    constructor(output, window, workspace) {
        this.output = output;
        this.window = window;
        this.workspace = workspace;
        var setting = workspace.getConfiguration("ForceCaller.setting");
        this.salesforce = new jsforce.Connection({
            // you can change loginUrl to connect to sandbox or prerelease env.
            loginUrl : setting.get("host")
        });
    }

    public connect(createContainer = null){
        var self = this;
        var setting = self.workspace.getConfiguration("ForceCaller.setting");
        self.write('Connecting to salesforce at '+setting.get("host")+' ....' + "\n");
        this.salesforce.login(setting.get('user'), setting.get('password'), function(err, res) {
            if (err) {
                self.write("Error: ");
                self.write(err);
                return console.error(err); 
            }
            self.write("Conectado a la organizacion: "+res.organizationId + "\n");
            self.org = res.organizationId;
            if(createContainer != null){
                self.createMetadataContainer(function(){
                    self.saveFilePrepare();
                });
            }
        });
    }

    public getFile()
    {
        var self = this;
        self.write("Org: " + self.org);
        console.log(self.window.activeTextEditor);
        console.log(self.window.activeTextEditor.document.uri.path);
        var fileName = self.window.activeTextEditor.document.uri.path.split('/');
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

    public save(){
        if(this.org == ''){
            this.connect(true);
        }
        else{
            this.saveFilePrepare();
        }
    }

    public saveFilePrepare()
    {
        var self = this;
        var setting = self.workspace.getConfiguration("ForceCaller.setting");
        self.write("Org: " + self.org + '\n');
        var newBody = self.window.activeTextEditor.document.getText();
        var fileName = self.window.activeTextEditor.document.uri.path.split('/');
        fileName = fileName[fileName.length - 1];
        var nameSplit = fileName.split('.');
        fileName = nameSplit[0];
        var ext = nameSplit[1];
        var apexType = (ext == 'cls') ? 'ApexClass' : ((ext == 'page') ? 'ApexPage' : 'ApexTrigger');
        var apexMember = apexType+'Member';
        console.log("-- Apex Type: "+ apexType + ", name: "+fileName);
        var self = this;
        self.write("Searching for file '"+fileName+"."+ext+"'....\n");
        this.salesforce.tooling.sobject(apexType)
        .find({ Name: fileName })
        .execute(function(err, records) {
            if (err) { return console.error(err); }
            console.log("fetched : " + records.length);
            console.log(records);
            for (var i=0; i < records.length; i++) {
                var record = records[i];
                console.log('Name: ' + record.Name);                                
                self.saveFile(apexType, fileName, apexMember, record.Id, newBody, ext);
            }
        });        
    }

    public saveFile(apexType, fileName, apexMember, recordId,newBody, ext)
    {
        var self = this;
        var metadataContainerId = self.containerId;
        self.salesforce.tooling.sobject(apexMember).create({
            MetadataContainerId: metadataContainerId,
            ContentEntityId: recordId,
            Body: newBody
        },function(err, res){
            if (err) { 
                self.write('Error at '+apexMember+'\n');
                console.error('Error at '+apexMember+'\n' );
                self.createMetadataContainer(function(){
                    self.saveFile(apexType, fileName, apexMember, recordId,newBody, ext);
                });
            }else{
                console.log("Se creo el paquete a enviar, respuesta: \n");
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

    public createMetadataContainer(callback = null){
        var self = this;
        self.salesforce.tooling.sobject('MetadataContainer')
        .find({ Name: 'SaveFromVsCode' })
        .execute(function(err, records) {
            if (err) { return console.error(err); }
            console.log(records);
            console.log("fetched : " + records.length);
            if(records.length > 0) {
                self.deleteMetadataContainer(records[0].Id, function(){
                    self.createContainer(callback);
                });
            }
            else{
                self.createContainer(null);
            }
        });
    }

    public createContainer(callback = null){
        var self = this;
        self.salesforce.tooling.sobject('MetadataContainer').create({Name: 'SaveFromVsCode'},function(err, res){
            if (err) { self.write("There was an error creating the MetadataContainer\n");return console.error(err); }
            console.log(res);
            self.write("Creado contenedor: "+res.id + "\n\n");
            self.containerId = res.id;
            if(callback != null){callback();}
        });
    }

    public deleteMetadataContainer(containerId, callback = null){
        var self = this;
        self.salesforce.tooling.sobject('MetadataContainer').delete(containerId, function(err, res){
            if (err) { self.write("There was an error deleting the MetadataContainer\n");return console.error(err); }
            console.log(res);
            if(callback != null){callback();}
        });
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