const {app, Tray, Menu, shell, Notification, dialog} = require('electron');
const {autoUpdater} = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const SerialPort = require('serialport');
/*
SerialPort.parsers = {
  Readline: require('@serialport/parser-readline')
}
const Readline = SerialPort.parsers.Readline;
const parser = new Readline();
*/
//const updater = require('./updater');

//const config = require('electron-json-config');
const Store = require('electron-store');
const store = new Store();
//console.log('userData:' + app.getPath('userData'));
//log.info('userData:' + app.getPath('userData'));
//console.log(config.file());
//console.log(config.keys());
//console.log(config.all());
let host = store.get("host");
if(!host) {
    host = "https://crm.fsfera.ru";
    store.set("host",host);
}
if(host == "http://crm.fsfera.ru:8080") {
    host = "https://crm.fsfera.ru";
    store.set("host",host);
}
const startUrl = host + '/set/';

console.log(startUrl);
log.info(startUrl);

let ports = [];
let foundPort = null;
let port = null;
let timerId = null;
let stopSerial = false;

let serialPort = store.get("serialPort");
if(!serialPort) {
    autoDetectPort();
}
console.log(serialPort);
log.info(serialPort);
const vendors = ['1eab','a108'];


let mainWindow, tray;

let buff = Buffer.from("");

function autoDetectPort() {
    SerialPort.list().then(result => {
	console.log(result);
	log.info(result);
	ports = [];
	result.forEach(p => {
	    ports.push(p);
	    if(p.vendorId && vendors.indexOf(p.vendorId.toString().toLowerCase()) >= 0) {
		serialPort = p.path;
		store.set('serialPort',serialPort);
		let msg = 'Autodetected port ' + serialPort;
		console.log(msg);
		log.info(msg);		
	    }
	});
    });
}

function createTray(ports,selPort) {
    tray = new Tray(path.join(__dirname, './icon/trayTemplate@2x.png'));
    tray.setToolTip('crmbar ' + app.getVersion());
    updateTray(ports,selPort);
}

function updateTray(ports,selPort) {
    let menu = [];

    menu.push({label: 'Version ' + app.getVersion(), type: 'normal'});
    menu.push({type: 'separator'});

    ports.forEach(p => {
	let man = '';
	if(p.vendorId && vendors.indexOf(p.vendorId.toString().toLowerCase()) >= 0 ) {
	    man = ' Barcode scanner';
	    //      let buf = Buffer.from(p.manufacturer);
	    //	man = ' ' + buf.toString('utf-8');	    
	}
	menu.push({label: p.path + man, type: 'radio', checked: p.path == selPort, click: () => selectPort(p.path)});
    });
    menu.push({ type: 'separator' });
    menu.push({ role: 'quit' });
    
    const contextMenu = Menu.buildFromTemplate(menu);
    tray.setContextMenu(contextMenu);
}

function selectPort(serPort) {
    serialPort = serPort;
    console.log('Changing port to ' + serialPort);
    log.info('Changing port to ' + serialPort);
    store.set("serialPort", serialPort);    
    if(port && port.isOpen) {
	try {
	    port.close();
	} catch(error) {
	    log.error(error);
	    console.log(error);
	    console.log("Can't close current port");
	}
    }
    waitingForSelectedPort();
}

function serialStart(serPort) {
    do {
	try {
	    port = new SerialPort(serPort,{autoOpen: false});
//	    port.pipe(parser);	    
	} catch(error) {
	    log.error(error);
	    console.log(error);
	    console.log("Can't open port " + serPort);
	    port = null;
	}
    } while(!port);

    console.log("SerialPort on port " + serPort + " started.");
    log.info("SerialPort on port " + serPort + " started.");
//    clearInterval(timerId);

    port.on('data', (data) => {

	buff = Buffer.concat([buff, Buffer.from(data)]);
	console.log(buff.toString('utf-8'));	
	log.info(buff.toString('utf8'));
	log.info('length',buff.length);
	let first = buff.toString('ascii', 0, 1);
	while(first == "\r" || first == "\n") {
	    buff = buff.slice(1);
	    first = buff.toString('ascii', 0, 1);
	}
	if(buff.length < 30) {

	    let value = buff.indexOf("\r");
	    if(value != -1) {
		buff = buff.subarray(0,value);	    
	    }
	    value = buff.indexOf("\n");
	    if(value != -1) {
		buff = buff.subarray(0,value);	    
	    }
	}

	if(buff.length == 0)  {
	    buff = Buffer.from("");
	    return;
	}
	
	log.info("buffer",buff.toString('utf8'));
	first = buff.toString('ascii', 0, 1);
	log.info("first",first);
	
	let url = '';
	
	if(first == 'A') {
	    url = startUrl + 'selectclient/?card_id=' + buff.toString().substring(1).trim();
	} else if(first == 'C') {
	    url = startUrl + 'gift_cert/?card_id=' + buff.toString().substring(1).trim();
	} else if(first == 'D') {
	    url = startUrl + 'order_barcode/?work_id=' + (buff.toString()).substring(1).trim();
	} else if(buff.length < 25) {
	    if(buff.length < 12) {
		log.info('length < 12 : ',buff.length);
               return;
	    } else {		
		url = startUrl + 'select_mdse/?barcode=' + buff.toString();
	    }
	} else {
	    url = startUrl + 'select_mdse/?hexbarcode=' + buff.toString('hex');
	}
	buff = Buffer.from("");
	console.log(url);
	log.info(url);    
	shell.openExternal(url);
    });

    port.on('close',() => {
	console.log('Port ' + serPort + ' closed');
	log.info('Port ' + serPort + ' closed');
	new Notification({title: 'Сканер отключен', body: 'Сканер на порту ' + serPort + ' отключён'}).show();
	waitingForSelectedPort();
    });
    
    port.on('open',() => {
	clearInterval(timerId);
	console.log('Port ' + serPort + ' opened');
	log.info('Port ' + serPort + ' opened');
	new Notification({title: 'Сканер подключен', body: 'Сканер на порту ' + serPort + ' подключён'}).show();
    });

    port.on('error', (err) => {
	log.error(err);
	console.log('Error: ', err);
    });

    port.open();
}

/*
function checkSerialPort() {
    let ports = [];
    foundPort = null;
    return SerialPort.list().then(result => {
	result.forEach(p => {
	    ports.push(p.path);
	});
    }).
	catch(err => {
	    console.log(err);
	});	
}
*/

function waitingForSelectedPort() {
    timerId = setInterval(trySelectedPort,2000);
}

function trySelectedPort() {
    if(stopSerial) return true;
    
    console.log('Trying port ' + serialPort);
    log.info('Trying port ' + serialPort);
    var foundPort = null;
    ports = [];
    SerialPort.list().then(result => {
	console.log(result);
	log.info(result);
	result.forEach(p => {
	    ports.push(p);
	    if(serialPort === undefined && p.vendorId && vendors.indexOf(p.vendorId.toString().toLowerCase()) >= 0) {
		serialPort = p.path;
		store.set('serialPort',serialPort);
		let msg = 'Autodetected port ' + serialPort;
		console.log(msg);
		log.info(msg);		
	    }
	    if(p.path == serialPort) foundPort = serialPort;
	});

	updateTray(ports,serialPort);
	if(foundPort) {
	    // update Tray
	    console.log('Port ' + serialPort +' found.');
	    log.info('Port ' + serialPort +' found.');
	    serialStart(foundPort);
	}
	
    }).
	catch(err => {
	    console.log(err);
	    log.error(err);
	});
    
}

if (process.env.NODE_ENV !== 'development') {
    
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "debug";

    setInterval(() => {
	autoUpdater.checkForUpdates();
    }, 300000);

    autoUpdater.on('checking-for-update', (event) => {
	log.info('Checking for update');
    });

    autoUpdater.on('update-not-available', (event) => {
	log.info('Update not available');
    });
    
    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
	const dialogOpts = {
	    type: 'info',
	    buttons: ['Перезагрузить', 'Позже'],
	    title: 'Обновления',
	    message: process.platform === 'win32' ? releaseNotes : releaseName,
	    detail: 'Новая версия загружена. Перезагрузить программу для установки?'
	};

	dialog.showMessageBox(dialogOpts).then((returnValue) => {
	    if (returnValue.response === 0) {
		stopSerial = true;
		if(port && port.isOpen) {
		    try {
			port.close();
		    } catch(error) {
			log.error(error);
			console.log(error);
			console.log("Can't close current port");
		    }
		}
		autoUpdater.quitAndInstall();
	    }
	});
    });

    autoUpdater.on('error', message => {
	console.error('There was a problem updating the application');
	console.error(message);
    });

}

app.on('ready', () => {
    createTray(ports,serialPort);
    waitingForSelectedPort();
    if (process.env.NODE_ENV !== 'development') {
	setTimeout(() => {
	    autoUpdater.checkForUpdates();
	}, 10000);
    }
});

