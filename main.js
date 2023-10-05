const {app, Tray, Menu, shell, Notification, dialog} = require('electron');
const {autoUpdater} = require('electron-updater');
const { trimBufferStart, trimBufferEnd, trimBuffer } = require('trim-buffer');
const log = require('electron-log');
const path = require('path');
const SerialPort = require('serialport').SerialPort;
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
if(!host || host == "http://crm.fsfera.ru:8080") {
    host = "https://crm.fsfera.ru";
    store.set("host",host);
}
const startUrl = host + '/set/';
const fsapiUrl = host + '/fsapi?/';

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
const vendors = ['1eab','a108','28e9','oc2e','0483','2dd6'];


let mainWindow, tray;

let buff = Buffer.from("");

function autoDetectPort() {
//    if(serialPort) serialPort = null;
//    store.set('serialPort',serialPort);
    SerialPort.list().then(result => {
	console.log(result);
	log.info(result);
	ports = [];
	result.forEach(p => {
	    ports.push(p);
	    if(p.vendorId && vendors.indexOf(p.vendorId.toString().toLowerCase()) >= 0) {
		if(serialPort != p.path && port && port.isOpen) port.close();
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
    menu.push({label: 'Автодетект порта', type: 'normal', click: () => autoDetectPort()});
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

function serialStart() {
    do {
	try {
	    port = new SerialPort({
                path: serialPort,
                baudRate: 9600,
                autoOpen: false
            });
//	    port.pipe(parser);	    
	} catch(error) {
	    log.error(error);
	    console.log(error);
	    console.log("Can't open port " + serialPort);
	    port = null;
	}
    } while(!port);

    console.log("SerialPort on port " + serialPort + " started.");
    log.info("SerialPort on port " + serialPort + " started.");
    clearInterval(timerId);

    port.on('data', (data) => {

	buff = Buffer.concat([buff, Buffer.from(data)]);
        buff = trimBuffer(buff);
	console.log(buff.toString('utf-8'));	
	log.info(buff.toString('utf8'));
	log.info('length',buff.length);
	let first = buff.toString('ascii', 0, 1);
	while(first == "\r" || first == "\n" || first == "\x01D") {
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

	let version = app.getVersion();
	
	if(first == 'A') {
	    url = startUrl + 'selectclient/?crmbar_version=' + version + '&card_id=' + buff.toString().substring(1).trim();
	} else if(first == 'C') {
	    url = startUrl + 'gift_cert/?crmbar_version=' + version + '&card_id=' + buff.toString().substring(1).trim();
	} else if(first == 'D') {
	    if(buff.length < 6) {
		log.info('length < 6 : ',buff.length);
		return;
	    }
	    url = startUrl + 'order_barcode/?crmbar_version=' + version + '&work_id=' + (buff.toString()).substring(1).trim();
	} else if(first == 'F') {
	    // packet
	    url = startUrl + 'packet_barcode/?crmbar_version=' + version + '&mode=prod&order_id=' + (buff.toString()).substring(1).trim();
	} else if(first == 'H') {
	    // transp packet
	    url = startUrl + 'packet_barcode/?crmbar_version=' + version + '&mode=manager&order_id=' + (buff.toString()).substring(1).trim();
	} else if(first == 'G') {
	    // calendar production
//	    url = fsapiUrl + 'order/calendar/' + (buff.toString()).substring(1).trim() + '/process';
	    url = startUrl + 'order_barcode/?crmbar_version=' + version + '&calendar=true&work_id=' + (buff.toString()).substring(1).trim();
	} else if(buff.length < 25) {
	    if(buff.length < 12) {
		log.info('length < 12 : ',buff.length);
               return;
	    } else {		
		if(buff.toString('ascii', 0, 4) == 'http') {
		    url = startUrl + 'select_mdse/?crmbar_version=' + version + '&wrong_code=' + buff.toString('hex');
		} else {
		    url = startUrl + 'select_mdse/?crmbar_version=' + version + '&barcode=' + buff.toString();
		}
	    }
	} else {
	    if(buff.toString('ascii', 0, 4) == 'http') {
		url = startUrl + 'select_mdse/?crmbar_version=' + version + '&wrong_code=' + buff.toString('hex');
	    } else {
		url = startUrl + 'select_mdse/?crmbar_version=' + version + '&hexbarcode=' + buff.toString('hex');
	    }
	}
	buff = Buffer.from("");
	console.log(url);
	log.info(url);    
	shell.openExternal(url);
    });

    port.on('close',() => {
	console.log('Port ' + serialPort + ' closed');
	log.info('Port ' + serialPort + ' closed');
	new Notification({title: 'Сканер отключен', body: 'Сканер на порту ' + serialPort + ' отключён'}).show();
	waitingForSelectedPort();
    });
    
    port.on('open',() => {
	clearInterval(timerId);
	console.log('Port ' + serialPort + ' opened');
	log.info('Port ' + serialPort + ' opened');
	new Notification({title: 'Сканер подключен', body: 'Сканер на порту ' + serialPort + ' подключён'}).show();
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
    if(!serialPort) return true;
    
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
	    serialStart();
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
	    detail: 'Новая версия CRMBAR загружена. Перезагрузить программу для установки новой версии?'
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
		setTimeout(() => {
		    autoUpdater.quitAndInstall();
		}, 2000);
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

