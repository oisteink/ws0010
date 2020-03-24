# ws0010
Node.js driver for OLED displays using the WS0010 controller
Uses the [rpio](https://www.npmjs.com/package/rpio) library for GPIO

link to ws0010 datasheet: https://cdn-shop.adafruit.com/datasheets/WS0010.pdf

There are drivers for both character and graphics mode.
Notes:
- If the IC is mounted on a graphic display it will show more characters in width than similar sized character display but without kerning both horizontal and vertical. In these cases the screen is often listed with pixel width and height instead of character / lines. You *can* use character mode, but it's not very readable.
- Reading from the display is not supported in paralell mode, the pins would have to be re-configured.. RW pin on the display should be connected to logic ground.

There are two components
- Screen driver
- Interface driver

Screendrivers:
- [X] Character driver
- [ ] Direct graphics display driver
- [X] Buffered graphics display driver

Note: the graphics driver uses a framebuffer. On the ws0010 the pixels are written to the controller 1 byte at a time, each byte representing 8 vertical pixels. This makes writing 1 pixel impractical and would require reading from DDRAM and this is unsupported  in paralell mode. Might implement this later for fun and giggles when I start doing the SPI part.

Interface drivers:
- [x] 4 bit paralell
- [x] 8 bit paralell
- [ ] SPI

Paralell interface constructor parameters:
- Register Select pin
- Enable pin
- Array of datapins ordered from low to high. 8 bit uses D0 - D7, 4 bit uses D4 - D7

SPI interface constructor:
TODO - The SPI device and chip select used I guess...

Notes:
- If you are switching interface data length without removing power from controller you must initialize the display twice. Won't fix, no practical use-case found.
- The pin numbering used are physical GPIO header pin numbers, *not* Broadcom GPIO numbers or WiringPI


Example usage for an 8 bit paralell interfaced 16 x 2 character OLED display, 8 pixel font height and the western european II font:
```javascript
const ws = require('ws0010');

//register select pin 
const rsPin = 32; 

//enable pin
const enablePin = 37;

//datapins from D0 to D8 
const dataPins = [32, 33, 31, 29, 15, 18, 13, 22];

let screenInterface = new ws.paralell8bitInterface(rsPin, enablePin, dataPins);

let screenLines = 2;
let fontHeight = 8;
let fontNumber = 3;
let screen = new ws.ws0010(screenInterface, screenLines, fontHeight, fontNumber);

screen.setCursorPos(0, 0);
screen.writeStr('First line of text');
screen.setCursorPos(0, 1);
screen.writeStr('Second line of text');
```

Example usage for a 4 bit paralell interfaced 100 x 16 graphic OLED display:
```javascript
const ws = requre('ws0010');

//register select pin 
const rsPin = 32; 

//enable pin
const enablePin = 37;

//datapins from D4 to D8 
const dataPins = [15, 18, 13, 22];

let screenInterface = new ws.paralell4bitInterface(rsPin, enablePin, dataPins);

let screenWidth = 100;
let screenHeight = 16;
let screen = new ws.ws0010_graphic(screenInterface, screenWidt, screenHeight);

//Put some random data into the buffer
for (y = 0; y < screenHeight; y++) {
    for (x = 0; x < screenWidth; x++) {
        screen.putPixel(x, y, Math.floor(Math.random() * 2))
    }
}

//Update display
screen.refreshDisplay();
```

