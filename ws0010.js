"use strict";

const rpio = require('rpio');
const buffers = require('./buffers.js') 

function wlbin(number){
    console.log(number.toString(2).padStart(8, '0'));
}

//commands
const OLEDCommands = { //Empty values kept for clearity in code when setting values, rather than omitting the values on set. Not used for bitmasking!
    CLEAR_DISPLAY: 0x01,

    RETURN_HOME: 0x02,

    ENTRY_MODE: 0x04,
    ENTRY_MODES: {
        DECREMENT: 0x00,
        INCREMENT: 0x02,
        SHIFT_ON_ENTRY: 0x01,
        NO_SHIFT_ON_ENTRY: 0x00
    },

    DISPLAY_CONTROL: 0x08,
    DISPLAY_CONTROLS: {
        DISPLAY_ON: 0x04,
        DISPLAY_OFF: 0x00,
        CURSOR_ON: 0x02,
        CURSOR_OFF: 0x00,
        BLINK_ON: 0x01,
        BLINK_OFF: 0x00
    },

    SHIFT: 0x10,
    SHIFTS: {
        RIGHT: 0x04,
        LEFT: 0x00,
        DISPLAY: 0x08,
        CURSOR: 0x00
    },

    MODE_POWER: 0x13, //0x10 with 2 lowest bits set is power and mode command
    MODES: {
        GRAPHICS_MODE: 0x08,
        CHARACTER_MODE: 0x00
    },
    POWERS: {
        DCDC_ON: 0x04,
        DCDC_OFF: 0x00
    },

    FUNCTION: 0x20,
    FUNCTIONS: { //not worth trying to break up as 3 of 4 sets would start with a number
        DATA_LENGTH_8BIT: 0x10,
        DATA_LENGTH_4BIT: 0x00,
        DISPLAYLINES_2: 0x08,
        DISPLAYLINES_1: 0x00,
        FONT_5x10: 0x04,
        FONT_5X8: 0x00,
        FONT_ENG_JAP: 0x00,
        FONT_WEST_EU_1: 0x01,
        FONT_ENG_RUS: 0x02,
        FONT_WEST_EU_2: 0x03
    },

    SET_CGRAM_ADDR: 0x40,

    SET_DDRAM_ADDR: 0x80,

    SEND_COMMAND: 0x00,
    SEND_DATA: 0x01
}

class deviceInterface {
    write(data, mode) {
        throw new Error('Abstract class\nData(data, mode) not implemented');
    }

    writeCommand(command) {
        this.write(command, OLEDCommands.SEND_COMMAND);
    }

    writeData(data) {
        this.write(data, OLEDCommands.SEND_DATA);
    }
}

//switching between 4 and 8 bit without removing power to controller is a bit off. You need to initialize 2 times before it works.
//wont'f fix, not a real world issue
class paralellInterface extends deviceInterface {
    constructor(rsPin = 7, enablePin = 37,  dataPins = [32, 33, 31, 29, 15, 18, 13, 22]) { //Datapins from D0 and up. Can be 4 or 8 of these
        super();
        this.rsPin = rsPin;
        rpio.open(this.rsPin, rpio.OUTPUT);

        this.enablePin = enablePin;
        rpio.open(this.enablePin, rpio.OUTPUT)

        this.dataPins = dataPins; 
        for (const pin of dataPins) {
            rpio.open(pin, rpio.OUTPUT);
        }
    }

    pulseEnable() {
        rpio.write(this.enablePin, rpio.HIGH); //this.board.digitalWrite(this.enablePin, HIGH);
        rpio.usleep(1);// enable pulse must be >250ns, shortest delay we have are 1000ns
        rpio.write(this.enablePin, rpio.LOW);//this.board.digitalWrite(this.enablePin, LOW);
        //rpio.usleep(0);// system cycle time is 500ns.  Our pulse is 1000ms so we don't need this.
    }
}

class paralell8bitInterface extends paralellInterface {
    write(data, mode) {
        rpio.write(this.rsPin, (mode == OLEDCommands.SEND_DATA) ? rpio.HIGH : rpio.LOW); //Set register select according to command/data
        for (let i = 0; i < 8; i++) {
            rpio.write(this.dataPins[i], (data >> i) & 0x01);
        }
        this.pulseEnable();
    }
}

class paralell4bitInterface extends paralellInterface {
    constructor(rsPin = 7, enablePin = 37, datapins = [15, 18, 13, 22]) {
        super(rsPin, enablePin, datapins);
        //to fix transfer mismatch send 0x00 5 times
        this.write4bits(0x00, OLEDCommands.SEND_COMMAND); 
        this.write4bits(0x00, OLEDCommands.SEND_COMMAND);
        this.write4bits(0x00, OLEDCommands.SEND_COMMAND);
        this.write4bits(0x00, OLEDCommands.SEND_COMMAND);
        this.write4bits(0x00, OLEDCommands.SEND_COMMAND);

        //send top 4 bits of funciton set for 4bit interface. After this normal init works.
        this.write4bits(0x02, OLEDCommands.SEND_COMMAND);
    }

    write4bits(data, mode) {
        rpio.write(this.rsPin, (mode == OLEDCommands.SEND_DATA) ? rpio.HIGH : rpio.LOW); //Set register select according to command/data
        for (let i = 0; i < 4; i++) {
            rpio.write(this.dataPins[i], (data >> i) & 0x01);
        }
        this.pulseEnable();
    }

    write(data, mode) {
        this.write4bits(data >> 4, mode);
        this.write4bits(data & 0x0F, mode);
    }
}

class ws0010 {
    constructor(deviceInterface, dataLength = 8, displayLines = 2, fontHeight = 8, fontNumber = 3) {
        this.deviceInterface = deviceInterface;
        switch (dataLength) {
            case 4: this.displayFunction = OLEDCommands.FUNCTIONS.DATA_LENGTH_4BIT; break;
            case 8: this.displayFunction = OLEDCommands.FUNCTIONS.DATA_LENGTH_8BIT; break;
            default: throw new Error('Only 4 or 8 bit data length supported');
        }
        switch (displayLines) {
            case 1: this.displayFunction |= OLEDCommands.FUNCTIONS.DISPLAYLINES_1; break;
            case 2: this.displayFunction |= OLEDCommands.FUNCTIONS.DISPLAYLINES_2; break;
            default: throw new Error('Only 1 or 2 display lines supported');
        }
        switch (fontHeight) {
            case 8: this.displayFunction |= OLEDCommands.FUNCTIONS.FONT_5X8; break;
            case 10: this.displayFunction |= OLEDCommands.FUNCTIONS.FONT_5x10; break;
            default: throw new Error('Only 8 or 10 pixel font height supported');
        }
        switch (fontNumber) {
            case 0: this.displayFunction |= OLEDCommands.FUNCTIONS.FONT_ENG_JAP; break;
            case 1: this.displayFunction |= OLEDCommands.FUNCTIONS.FONT_WEST_EU_1; break;
            case 2: this.displayFunction |= OLEDCommands.FUNCTIONS.FONT_ENG_RUS; break;
            case 3: this.displayFunction |= OLEDCommands.FUNCTIONS.FONT_WEST_EU_2; break;
            default: throw new Error('Unsupported font!\n0 = English / Japanese\n1 = Western Europe I\n2 = English / Russian\n3 = Western Europe II');
        }

        //Set defaults to values
        this.displayControl = OLEDCommands.DISPLAY_CONTROLS.DISPLAY_ON | OLEDCommands.DISPLAY_CONTROLS.CURSOR_OFF | OLEDCommands.DISPLAY_CONTROLS.BLINK_OFF;
        this.entryMode = OLEDCommands.ENTRY_MODES.INCREMENT | OLEDCommands.ENTRY_MODES.NO_SHIFT_ON_ENTRY;
        this.modePower = OLEDCommands.MODES.CHARACTER_MODE | OLEDCommands.POWERS.DCDC_ON;

        this.setDisplayFunction();
        this.setDisplayControl();
        this.displayClear();
        this.returnHome();
        this.setEntryMode();
        this.setModePower();
    }

    command(command) {
        this.deviceInterface.writeCommand(command);
    }

    writeData(data) {
        this.deviceInterface.writeData(data);
    }

    writeChar(char) {
        this.deviceInterface.writeData(char.charCodeAt(0));
    }

    writeStr(string) {
        for (const char of string) {
            this.deviceInterface.writeData(char.charCodeAt(0));
        }
    }

    displayClear() {
        this.deviceInterface.writeCommand(OLEDCommands.CLEAR_DISPLAY);
    }

    returnHome() {
        this.deviceInterface.writeCommand(OLEDCommands.RETURN_HOME);
    }

    setEntryMode() {
        this.deviceInterface.writeCommand(OLEDCommands.ENTRY_MODE | this.entryMode);
    }

    setDisplayControl() {
        this.deviceInterface.writeCommand(OLEDCommands.DISPLAY_CONTROL | this.displayControl);
    }

    setDisplayOff() {
        this.displayControl &= ~OLEDCommands.DISPLAY_CONTROLS.DISPLAY_ON; //Turn off by masking out ON bit
        this.setDisplayControl();
    }

    setDisplayOn() {
        this.displayControl |= OLEDCommands.DISPLAY_CONTROLS.DISPLAY_ON; //Turn on by adding ON bit
        this.setDisplayControl();
    }

    setCursorOff() {
        this.displayControl &= ~OLEDCommands.DISPLAY_CONTROLS.CURSOR_ON; //Turn off by masking out ON bit
        this.setDisplayControl();
    }

    setCursorOn() {
        this.displayControl |= OLEDCommands.DISPLAY_CONTROLS.CURSOR_ON; //Turn on by adding ON bit
        this.setDisplayControl();
    }

    setBlinkOff() {
        this.displayControl &= ~OLEDCommands.DISPLAY_CONTROLS.BLINK_ON; //Turn off by masking out ON bit
        this.setDisplayControl();
    }

    setBinkOn() {
        this.displayControl |= OLEDCommands.DISPLAY_CONTROLS.BLINK_ON;
        this.setDisplayControl();
    }

    shiftCursorRight() {
        this.deviceInterface.writeCommand(OLEDCommands.SHIFT | OLEDCommands.SHIFTS.RITHG | OLEDCommands.SHIFTS.CURSOR);
    }

    shiftCursorLeft() {
        this.deviceInterface.writeCommand(OLEDCommands.SHIFT | OLEDCommands.SHIFTS.LEFT | OLEDCommands.SHIFTS.CURSOR);
    }

    shiftDisplayRight() {
        this.deviceInterface.writeCommand(OLEDCommands.SHIFT | OLEDCommands.SHIFTS.RIGHT | OLEDCommands.SHIFTS.DISPLAY);
    }

    shiftDisplayLeft() {
        this.deviceInterface.writeCommand(OLEDCommands.SHIFT | OLEDCommands.SHIFTS.LEFT | OLEDCommands.SHIFTS.DISPLAY);
    }

    setModePower() {
        this.deviceInterface.writeCommand(OLEDCommands.MODE_POWER | this.modePower);
    }

    setCharacterMode() {
        this.modePower &= ~OLEDCommands.MODES.GRAPHICS_MODE; //Mask out bit
        this.setModePower();
    }

    setGraphicsMode() {
        this.modePower |= OLEDCommands.MODES.GRAPHICS_MODE;
        this.setModePower();
    }

    setDCDCoff() {
        this.modePower &= ~OLEDCommands.POWERS.DCDC_ON; //mask out bit
        this.setModePower();
    }

    setDCDCon() {
        this.modePower |= OLEDCommands.MODES.DCDC_ON;
        this.setModePower();
    }

    //Datasheet states that Function Set can only be executed while display is off, and that font settings can only be changed if data lenght is changed
    //Function will therefore be considered low level and not implemented on bit level.
    setDisplayFunction() {
        this.deviceInterface.writeCommand(OLEDCommands.FUNCTION | this.displayFunction);
    }

    setCGRAMaddress(address) {
        this.deviceInterface.writeCommand(OLEDCommands.SET_CGRAM_ADDR | address);
    }

    setDDRAMaddress(address) {
        this.deviceInterface.writeCommand(OLEDCommands.SET_DDRAM_ADDR | address);
    }

    setCursorPos(column, row) {
        this.setDDRAMaddress((row << 6) | column);
    }

    finalize() {
        this.displayClear();
        this.setDisplayOff();
    }
}

class ws0010_graphic extends ws0010 {
    constructor(deviceInterface, dataLength = 8, displayLines = 2, fontHeight = 8, fontNumber = 3) {
        super(deviceInterface, dataLength, displayLines, fontHeight, fontNumber);
        this.setGraphicsMode();
        this.frameBuffer = new buffers.oledFrameBuffer(100, 16);
    }

    clearBuffer(){
        this.frameBuffer.clear();
    }

    refreshDisplay(){ //ram is 200 bytes = two rows of 100 bytes. Each byte is 1 pixel width columns of 8 pixels height.
        for (const byte of this.frameBuffer.ddramBuffer) {
            this.writeData(byte);
        }
    }

    putPixel(x, y, colour) {
        this.frameBuffer.putPixel(x, y, colour);
    }

    getPixel(x, y) {
        result = this.frameBuffer.getPixel(x, y);
    }
}

module.exports = {ws0010, ws0010_graphic, paralell4bitInterface, paralell8bitInterface, OLED: OLEDCommands}
