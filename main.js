const {app, Tray, Menu, BrowserWindow, shell, Notification} = require('electron');
const log = require('electron-log');
const path = require('path');

//const config = require('electron-json-config');
const Store = require('electron-store');
const store = new Store();
//console.log('userData:' + app.getPath('userData'));
//log.info('userData:' + app.getPath('userData'));
//console.log(config.file());
//console.log(config.keys());
//console.log(config.all());
const startUrl = store.get("host","http://crm.fsfera.ru:8080") + '/set/';
console.log(startUrl);
log.info(startUrl);
let serialPort = store.get("serialPort","/dev/tty.usbmodem000000001");
console.log(serialPort);
log.info(serialPort);

const SerialPort = require('serialport');

let ports = [];
let foundPort = null;
let port = null;
let timerId = null;


let mainWindow, tray;

function createTray(ports,selPort) {
    tray = new Tray(path.join(__dirname, './icon/trayTemplate@2x.png'));
    tray.setToolTip('crmbar');
    updateTray(ports,selPort);
}

function updateTray(ports,selPort) {
    let menu = [];

    ports.forEach(p => {
	menu.push({label: p.path + (p.manufacturer? ' ' + p.manufacturer : ''), type: 'radio', checked: p.path == selPort, click: () => selectPort(p.path)});
    });
    menu.push({ type: 'separator' });
    menu.push({ role: 'quit' });
    
    const contextMenu = Menu.buildFromTemplate(menu);
    tray.setContextMenu(contextMenu);
}

function selectPort(serPort) {
    serialPort = serPort;
    console.log('Changing port to ' + serialPort);
    store.set("serialPort", serialPort);    
    if(port && port.isOpen) {
	port.close();
    }
    waitingForSelectedPort();
}

function serialStart(serPort) {
    do {
	try {
	    port = new SerialPort(serPort);
	} catch(error) {
	    console.log(error);
	    console.log("Can't open port " + serPort);
	    port = null;
	}
    } while(!port);

    port.on('data', function (data) {

	const buff = Buffer.from(data);
	console.log(buff.toString());
	log.info(buff.toString('utf8'));
//	log.info(buff.toString('hex'));
	let first = buff.toString('ascii', 0, 1);
	let url = '';
	
	if(first == 'A') {
	    url = startUrl + 'selectclient/?card_id=' + buff.toString().substring(1).trim();
	} else if(first == 'C') {
	    url = startUrl + 'gift_cert/?card_id=' + buff.toString().substring(1).trim();
	} else if(first == 'D') {
	    url = startUrl + 'order_barcode/?work_id=' + (buff.toString()).substring(1).trim();
	} else if(buff.length<25) {
	    url = startUrl + 'select_mdse/?barcode=' + buff.toString();        
	} else {
	    url = startUrl + 'select_mdse/?hexbarcode=' + buff.toString('hex');
	}
	console.log(url);
	shell.openExternal(url);
    });

    port.on('close',() => {
	console.log('Port ' + serPort + ' closed');
	new Notification({title: 'Сканер отключен', body: 'Сканер на порту ' + serPort + ' отключён'}).show()
	waitingForSelectedPort();
    });   
    port.on('open',() => {
	clearInterval(timerId);
	console.log('Port ' + serPort + ' opened');
	new Notification({title: 'Сканер подключен', body: 'Сканер на порту ' + serPort + ' подключён'}).show()
    });   
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
    console.log('Trying port ' + serialPort);
    var foundPort = null;
    ports = [];
    SerialPort.list().then(result => {
	console.log(result);
	log.info(result);
	result.forEach(p => {
	    ports.push(p);
	    if(p.path == serialPort) foundPort = serialPort;
	});

	if(foundPort) {
	    // update Tray
	    
	    updateTray(ports,serialPort);
	    serialStart(foundPort);
	}
    }).
	catch(err => {
	    console.log(err);
	    log.error(err);
	});
    
}

app.on('ready', () => {
    createTray(ports,serialPort);
    waitingForSelectedPort();    

});

