//importa firebase lib
var firebase = require('firebase');
var express = require('express');
var path= require('path');
//body parser deprecated, usando formidable para file uploads
var bodyParser= require('body-parser');
var formidable = require('formidable');
var fs = require('fs');
const Mam = require('@iota/mam');
const { asciiToTrytes, trytesToAscii } = require('@iota/converter')

const crypto = require('crypto');

const mode = 'restricted'
const provider = 'https://nodes.devnet.iota.org'

var mamExplorerLink = 'https://mam-explorer.firebaseapp.com/'
 //console.log(`MAM Explorer:\n${mamExplorerLink}${readData.root}\n`); 
var app = express();
var readData;

var urlencodedParser = bodyParser.urlencoded({ extended: true });
app.use(express.static(__dirname));
app.engine('html', require('ejs').renderFile);





//Inicializa con parámetros de mi aplicación firebase
const firebaseConfig = {
    
  };
firebase.initializeApp(firebaseConfig);

async function autenticacion(email,password){

  let loged;

  await firebase.auth().signInWithEmailAndPassword(email, password)

    .then(function(result){
        console.log("auth correcta");
        loged= true;
        
        firebase.auth().onAuthStateChanged((user) => {
          
        });
      
    })
    
    .catch(function(error) {
    console.log("login fallido");
    
    console.log(error);
    loged=false;
    //esto debe cambiarse y atach a formulario de creación de usuario
    //creaUser();
    });
    return loged;
}
async function creaUser(){

  firebase.auth().createUserWithEmailAndPassword(email, password)

    .then(function(result){
        console.log("usuario creado ok");
    })
    
    .catch(function(error) {
    console.log("fallo al crear usuario");
    console.log(error);
    });
}

/*parte de servidor express*/ 

app.post('/retrieve',urlencodedParser, async function (req, res) {

  var existedocid= await existeDocId(req.body.docID);
  var readData= await readUserData(req.body.docID);

  if(existedocid){
  mamExplorerLink = `https://mam-explorer.firebaseapp.com/?provider=${encodeURIComponent(provider)}&mode=${mode}&key=${readData.secretKey.padEnd(81, '9')}&root=${readData.root}`
  console.log(`MAM Explorer:\n${mamExplorerLink}\n`); 
  var name=readData.email;
  res.render(__dirname + '/login.html', {name:name, mamExplorerLink:mamExplorerLink});
  }
 });

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname + '/index.html'));
});

app.post('/', urlencodedParser, async function (req, res) {

  //res.sendFile(path.join(__dirname + '/login.html'));
  var email=req.body.user;
  var password=req.body.pass;
  var logedin= await autenticacion(email,password);
  
  if(logedin){
    
    //res.sendFile(path.join(__dirname + '/login.html'));
    var name = email;
    res.render(__dirname + '/login.html', {name:name, mamExplorerLink:mamExplorerLink});
  }else{
    
    res.sendFile(path.join(__dirname + '/index.html'));
  }
});

app.post('/fileupload', async function (req, res) {
  var docId
  var hash
  var newpath
    
  var form = new formidable.IncomingForm();

  hash = await new Promise(function (resolve, reject) {
  //recupera el fichero, lo mueve a uploads y calcula su hash
  form.parse(req, function (err, fields, files) {
    if (err) {
      reject(err);
      return;
    }
    var oldpath = files.filetoupload.path;
    newpath = 'C:/Users/Alonn/Develope/WS UNIR/Prácticas/workspaceIOTA/uploads/' + files.filetoupload.name;
    docId=files.filetoupload.name;
    docId= path.basename(newpath, '.txt'||'.docx'||'.*')
    console.log(docId);
    fs.rename(oldpath, newpath, function (err) {
      var algo = 'sha256';
      var shasum =  crypto.createHash(algo);
      var s =  fs.ReadStream(newpath);
       s.on('data', function(d) {
          shasum.update(d); 
         
        });
       s.on('end', function() {
          hash = shasum.digest('hex');
          resolve(hash);
          
      });
      
    })
  })})


  var user=firebase.auth().currentUser;
  var existedocid= await existeDocId(docId);
  var mamState;
  var secretKey;
  
  if(existedocid){
    console.log("docid existente, se añadirá al stream");
    var readData= await readUserData(docId);
   
    mamState=await inicializaMam(readData.secretKey, readData.seed, readData.nextRoot,readData.index,false);
  }else{

    console.log("docid nuevo, se creará un nuevo stream");
    secretKey= asciiToTrytes(user.uid);
    mamState=await inicializaMam(secretKey, undefined, undefined,undefined,true);
  }

  var root=Mam.getRoot(mamState) 
  const nextRoot = await publish({
    usuario: user.email,
    docId: docId,
    hash: hash,
    timestamp: (new Date()).toLocaleString()
    
  },mamState)
  
  if (existedocid){
    
    var update = await updateUserData(mamState.channel.start,nextRoot,docId,hash);
  }else{
    console.log("aqui casca");
    var escritura=await writeUserData(user.uid,user.email,docId,hash,mamState.channel.start,root,nextRoot,secretKey,mamState.seed);
    
  }
  res.render(__dirname + '/login.html', {name:user.email, mamExplorerLink:mamExplorerLink});
});


app.post('/manupload', urlencodedParser,async function(req, res){

  var user=firebase.auth().currentUser;
  var existedocid= await existeDocId(req.body.docID);
  var mamState;
  var secretKey;
  
  if(existedocid){
    console.log("docid existente, se añadirá al stream");
    var readData= await readUserData(req.body.docID);
    
    mamState=await inicializaMam(readData.secretKey, readData.seed, readData.nextRoot,readData.index,false);
  }else{

    console.log("docid nuevo, se creará un nuevo stream");
    secretKey= asciiToTrytes(user.uid);
    mamState=await inicializaMam(secretKey, undefined, undefined,undefined,true);
  }

  var root=Mam.getRoot(mamState) 
  const nextRoot = await publish({
    usuario: user.email,
    docId: req.body.docID,
    hash: req.body.Hash,
    timestamp: (new Date()).toLocaleString()
    
  },mamState)
  
  if (existedocid){
    
    var update = await updateUserData(mamState.channel.start,nextRoot,req.body.docID,req.body.Hash);
  }else{
    var escritura=await writeUserData(user.uid,user.email,req.body.docID,req.body.Hash,mamState.channel.start,root,nextRoot,secretKey,mamState.seed);
    
  }
  res.render(__dirname + '/login.html', {name:user.email, mamExplorerLink:mamExplorerLink});
  
});

app.listen(3000, function () {
  console.log('iota trazabilidad, puerto 3000!');
  console.log(__dirname);
});

//envia datos en JSON a la DDBB realtime database.
async function writeUserData(userId,  email, docId, hashsha256, index, root, nextRoot,secretKey,seed) {
  
  var escritura= firebase.database().ref('users/'+userId+'/'+docId);
  escritura.set({
    
    email:email,
    hashsha256:hashsha256,
    index:index,
    root:root,
    nextRoot:nextRoot,
    secretKey:secretKey,
    seed:seed


  })
  .then(function(){
    console.log("test token");
    
  
  });
  return true;
}

async function readUserData(docId){
  var user=firebase.auth().currentUser;
  var test;
  var lectura= firebase.database().ref('users/'+user.uid+'/'+docId);
  await lectura.once('value',function(snapshot){
    test= snapshot.val();
    
    
  }).then(function(){
  })
  .catch(function(error) {
    console.log(error);
  })
  
  return test
}

async function updateUserData(index,nextRoot,docId,Hash){
  var user=firebase.auth().currentUser;
  var actualiza= firebase.database().ref('users/'+user.uid);
  var updates={};
  updates[docId +'/index' ] = index;
  updates[docId +'/nextRoot'] = nextRoot;
  updates[docId +'/hashsha256'] = Hash;
  console.log(updates);
  await actualiza.update(updates);
    
  return true;
}

async function existeDocId(docId){

  var user=firebase.auth().currentUser;
  var existe=false;
  var lectura= firebase.database().ref('users/'+user.uid);
  await lectura.once('value',function(snapshot){
    snapshot.forEach(function(childSnapshot){
      var root= childSnapshot.key;
      if (root==docId){
        existe=true;
      }
    })
  }).then(function(){
  })
  .catch(function(error) {
    console.log(error);
  })
  
  return existe
}

async function hashFichero(filename,algorithm = 'sha256'){
  return new Promise((resolve, reject) => {

    let shasum = crypto.createHash(algorithm);
    try {
      let s = fs.ReadStream(filename)
      s.on('data', function (data) {
        shasum.update(data)
      })
      // making digest
      s.on('end', function () {
        const hash = shasum.digest('hex')
        return resolve(hash);
      })
    } catch (error) {
      return reject('calc fail');
    }
  });

}

async function inicializaMam(secretKey, seed, nextroot, index, isnew){
  
  // Initialise MAM State
  var mamState = await Mam.init(provider,seed);
  mamState = await Mam.changeMode(mamState, mode, secretKey);
  
  if (isnew!=true){
    mamState.channel.next_root=nextroot;
    mamState.channel.start=index;
  }
  
  return mamState;
}

// Publish to tangle
const publish = async(packet,mamState) => {
    // Create MAM Payload - STRING OF TRYTES
    const trytes = asciiToTrytes(JSON.stringify(packet))
    //console.log("mamState subscribe con next root: "+JSON.stringify(mamState,null, 4));
    const message = Mam.create(mamState, trytes)
    //console.log("mamState 2: "+JSON.stringify(mamState,null, 4));
    console.log("message: "+JSON.stringify(message.state,null, 4));
    // Save new mamState
    mamState = message.state 
    // Attach the payload
    console.log("message.address: "+message.address);
    await Mam.attach(message.payload, message.address, 3, 9)
    return mamState.channel.next_root
}


