const fs = require('fs');
const readlineSync = require('readline-sync');


// --- defaults ---
const sizeOfMemory = 1000;
const defaultRegisterRange = [-7999, 7999];
const SayText = '';
const inputText = '> ';
let debuging = false;

// --- classes ---
Number.prototype.pad = function(size) {
  var s = String(this);
  while (s.replace('-', '').length < (size || 2)) {s = "0" + s;}
  return s;
}

class Register {
	constructor(options) {
		options || throwError('Options required');
		this.range = options.range || defaultRegisterRange; //[ОТ, ДО] or [[число, число, число]]
		this.data = 0;
		this.name = options.name || '[unknown name]'
	}

	isInRange(val) {
		if (typeof this.range[0] === typeof Number()) {
			debug(`isInRange: range: ${this.range} (interval); val: ${val} (${typeof val}); result: ${this.range[0] <= val && val <= this.range[1]}`);
			return this.range[0] <= val && val <= this.range[1]
		}else if (typeof this.range[0] === typeof Array()){
			debug(`isInRange: range: ${this.range} (set); val: ${val} (${typeof val}); result: ${this.range[0].includes(val)}`);
			return this.range[0].includes(val)
		}else {
			internalError('Unknown type of range');
		}
	}

	set val(val) {
		debug(`trying to set ${this.name} to: ${val}`);
		if (!this.isInRange(val)) {
			internalError(`Register out of range (${val})`);
		}else {
			this.data = val;
			debug('success');
		}
	}
}

//Control unit (УУ)
class CU {
	constructor() {
		this.RA = new Register({range: [0, 9999], name: 'RA'}); //Регист адреса
		this.RK = new Register({range: [Object.keys(f0Commands).map((id) => {return id}).concat(Object.keys(f1Commands).map((id) => {return id}))], name: 'RK'}); //Регист команды

		Object.defineProperty(this.RK, 'val', {
			set: function(val) {
				debug(`trying to set ${this.name} to: ${val}`);
				if (!this.isInRange(val)) {
					internalError(`Unknown command(${val})`);
					halt = true;
				}else {
					this.data = val;
					debug('success');
				}
			}
		});
	}

	next() {
		let currentCommand = this.RK.data;
		if (f0Commands.hasOwnProperty(currentCommand) || f1Commands.hasOwnProperty(currentCommand)) {
			if (f0Commands.hasOwnProperty(currentCommand)) {
				MiK.execCommand(currentCommand, 0);
				this.RA.val = this.RA.data + 1;
				//console.log('command type is f0');
			}else {
				MiK.execCommand(currentCommand, 1);
				this.RA.val = this.RA.data + 3;
				//console.log('command type is f1');
			}
			return true
		}else {
			if (currentCommand === 0) {
				if (this.RA.data === 0) {
					this.RA.val = this.RA.data + 1;
					return true
				}else{
					return null
				}
			}else {
				internalError('Unknown command');
				return false
			}
		}
	}
}

//Arithmetic logic unit (АЛУ)
class ALU {
	constructor() {
		this.S = new Register({name: 'S'}); //Сумматор
		this.R1 = new Register({name: 'R1'}); //Рабочий регистр
		this.W = new Register({range: [[-1, 0, 1]], name: 'W'}); //Регистр признака

		Object.defineProperty(this.S, 'val', {
			set: function(val) {
				debug(`trying to set ${this.name} to: ${val}`);
				if (!this.isInRange(val)) {
					internalError(`W register out of range (${val})`);
				}else {
					this.data = val;
					if (this.data > 0) {
						MiK.processor.alu.W.val = 1;
					}else if (this.data < 0) {
						MiK.processor.alu.W.val = -1;
					}else {
						MiK.processor.alu.W.val = 0;
					}
					debug('success');
				}
			}
		});
	}

	add() {
		debug(`${this.S.data} + ${this.R1.data} = ${this.S.data + this.R1.data}`);
		this.S.val = this.S.data + this.R1.data;
	}

	sub() {
		debug(`${this.S.data} + ${this.R1.data} = ${this.S.data - this.R1.data}`);
		this.S.val = this.S.data - this.R1.data;
	}
}

class Processor {
	constructor() {
		this.cu = new CU();
		this.alu = new ALU();
	}
}

class Memory {
	constructor() {
		this.line = new Array();
		for (var i = 0; i < sizeOfMemory; i++) {
		   this.line.push('00');
		}
	}
}

class MIK {
	constructor() {
		this.processor = new Processor();
		this.memory = new Memory();
	}

	next() {
		if (this.processor.cu.RA.data < this.memory.line.length) {
			this.processor.cu.RK.val = this.memory.line[this.processor.cu.RA.data];
			let status = this.processor.cu.next();
			//console.log('status is', status);
			if (status === null) {
				// '0' После комманд
			}
			return status
		}else{
			this.processor.cu.RA.val = 0;
		}
	}

	execCommand(commandId, f) {
		if (!halt) {
			debug('command is: ' + commandId);
			switch (f) {
				case 0:
				f0Commands[commandId](this);
				break;
				case 1:
				debug('arg: ' + Number(this.memory.line[this.processor.cu.RA.data+1] + this.memory.line[this.processor.cu.RA.data+2]));
				f1Commands[commandId](this, Number(this.memory.line[this.processor.cu.RA.data+1] + this.memory.line[this.processor.cu.RA.data+2]));
				break;
			}
			debug('--- end of execution ---\n');
		}
	}
}

// --- global funcs ---
function throwError(msg) {
	throw msg;
}
function internalError(msg) {
	console.log('Error:', msg);
}
function debug(msg) {
	if (debuging) {
		console.log(msg);
	}
}
function say(msg) {
	console.log(SayText + msg);
}
function strNumFix(num) {
	if (num.indexOf('-') != -1) {
		return '-' + num.replace('-', '')
	}
	return num
}

// --- global consts ---
const f0Commands = {'01': function(context) {context.processor.alu.S.val = Number(readlineSync.question(inputText))}, '02': function(context) {say(context.processor.alu.S.data);}, '99': function(context) {say('[HALTED]'); halt = true;}, '00': function(context) {console.log(`Warning! <00> command on ${context.processor.cu.RA.data} address, execution halted`); halt = true;}};
const f1Commands = {'10': function(context, arg) {context.processor.alu.R1.val = Number(strNumFix(context.memory.line[arg] + context.memory.line[arg+1])); context.processor.alu.add();}, '11': function(context, arg) {context.processor.alu.R1.val = Number(strNumFix(context.memory.line[arg] + context.memory.line[arg+1])); context.processor.alu.sub();}, '12': function(context, arg) {context.processor.alu.W.val = Number(context.processor.alu.S.data + strNumFix(context.memory.line[arg] + context.memory.line[arg+1]));}, '21': function(context, arg) {context.processor.alu.S.val = Number(strNumFix(context.memory.line[arg] + context.memory.line[arg+1])); console.log(typeof context.processor.alu.S.data);}, '22': function(context, arg) {context.memory.line[arg] = String(context.processor.alu.S.data.pad(4)).substring(0, 2); context.memory.line[arg+1] = String(context.processor.alu.S.data.pad(4)).substring(2); debug(context.memory.line)}, '23': function(context, arg) {context.processor.alu.S.val = arg;}, '30': function(context, arg) {context.processor.cu.RA.val = arg-3;}, '33': function(context, arg) {if(context.processor.alu.W.data === 0){context.processor.cu.RA.val = arg-3}}, '34': function(context, arg) {if(context.processor.alu.W.data < 0){context.processor.cu.RA.val = arg-3}}};
const asciiLogo = String.raw`
 __/\\\\____________/\\\\__/\\\\\\\\\\\__/\\\________/\\\__/\\\________/\\\_
  _\/\\\\\\________/\\\\\\_\/////\\\///__\/\\\_____/\\\//__\/\\\_______\/\\\_
   _\/\\\//\\\____/\\\//\\\_____\/\\\_____\/\\\__/\\\//_____\/\\\_______\/\\\_
    _\/\\\\///\\\/\\\/_\/\\\_____\/\\\_____\/\\\\\\//\\\_____\/\\\_______\/\\\_
     _\/\\\__\///\\\/___\/\\\_____\/\\\_____\/\\\//_\//\\\____\/\\\_______\/\\\_
      _\/\\\____\///_____\/\\\_____\/\\\_____\/\\\____\//\\\___\/\\\_______\/\\\_
       _\/\\\_____________\/\\\_____\/\\\_____\/\\\_____\//\\\__\//\\\______/\\\__
        _\/\\\_____________\/\\\__/\\\\\\\\\\\_\/\\\______\//\\\__\///\\\\\\\\\/___
         _\///______________\///__\///////////__\///________\///_____\/////////_____

		`;

// --- global variables ---
let halt = false;


let MiK = new MIK();

//---Для комманд из файла
/*
* Файлы .miku - основной формат файлов MIKU (Не совместим с эмулятором MiK)
* Файлы .json - дополнительный формат файлов MIKU (Не совместим с эмулятором MiK)
* Файлы других форматов (.txt, .mik) - формат файлов эмулятора MiK (Совместим с эмулятором MIKU)
*/
if (process.argv[2] != undefined) {
	let commandsFromFile = fs.readFileSync(process.argv[2], 'utf8');
	let typeOfFile = process.argv[2].substring(process.argv[2].lastIndexOf('.')+1);
	if (typeOfFile === 'miku') {
		// TODO
	}else if(typeOfFile === 'json'){
		commandsFromFile = JSON.parse(commandsFromFile);
		for (var i = 0; i < commandsFromFile.length; i++) {
			MiK.memory.line[i] = commandsFromFile[i];
		}
	}else {
		for (var i = 0; i < commandsFromFile.length; i+=2) {
			MiK.memory.line[i/2] = commandsFromFile.substring(i, i+2);
		}
	}
}
//---

console.log(asciiLogo);
debug(MiK.memory.line);

while (MiK.next() && !halt) {}
//End
