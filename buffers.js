'use strict';

class frameBuffer {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.frameBuffer = new Uint8Array(width * height);
    }
    
    isInRange(x, y) {
        result = (x < this.width && x >= 0 && y < this.height && y >= 0);
    }

    putPixel(x, y, colour) {
        if (this.isInRange(x, y)) {
            this.frameBuffer[x + y * this.width] = colour;
        }
    }

    getPixel(x, y) {
        if (this.isInRange(x, y)) {
            return this.frameBuffer[x + y * this.width];
        } else return -1;
    }

    clear() {
        this.frameBuffer.fill(0);
    }

}

class oledFrameBuffer extends frameBuffer {
    constructor(width, height) {
        super(width, height);
        this.lines = this.height >> 3; //8 bits per line
    }

    get ddramBuffer() {
        let result = [];
        for (let line = 0; line < this.lines; line++) {
            for (let x = 0; x < this.width; x++) {
                let offset = x + (line << 3) * this.width;
                result.push( //1 bit from each of 8 lines
                    this.frameBuffer[offset] | 
                    this.frameBuffer[offset + this.width] << 1| 
                    this.frameBuffer[offset + 2 * this.width] << 2| 
                    this.frameBuffer[offset + 3 * this.width] << 3| 
                    this.frameBuffer[offset + 4 * this.width] << 4| 
                    this.frameBuffer[offset + 5 * this.width] << 5| 
                    this.frameBuffer[offset + 6 * this.width] << 6| 
                    this.frameBuffer[offset + 7 * this.width] << 7
                )
            }
        }
        return result;
    }
}

class regionBuffer extends frameBuffer {
    paintTo(buffer, xOffset, yOffset, width) {
        let bufferOffset = xOffset + yOffset * width;
        for (y = 0; y < this.height; y++) {
            for (x = 0; x < this.width; x++)
                buffer[bufferOffset + x + y * this.width] = this.frameBuffer[x + y * this.width];
        }
    }
}

module.exports = { frameBuffer, oledFrameBuffer }