const fs = require('fs');
const PNG = require('pngjs').PNG;

function processSprite(inFile, outFile) {
    fs.createReadStream(inFile)
        .pipe(new PNG({ filterType: 4 }))
        .on('parsed', function () {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    let idx = (this.width * y + x) << 2;
                    let r = this.data[idx];
                    let g = this.data[idx + 1];
                    let b = this.data[idx + 2];

                    if (r > 200 && g < 50 && b > 200) {
                        this.data[idx + 3] = 0; // Alpha transparent
                    }
                    else if (r > 240 && g > 240 && b > 240) {
                        // Anti-artifacting: remove near-pure white pixels as well
                        this.data[idx + 3] = 0;
                    }
                }
            }
            this.pack().pipe(fs.createWriteStream(outFile))
                .on('finish', () => console.log('Successfully processed ' + outFile));
        });
}

// Re-process P1 to remove white artifacts
processSprite('fighter_sprite_sheet.png', 'fighter_sprite_sheet_transparent.png');
// Process P2
processSprite('fighter_2_sprite_sheet.png', 'fighter_2_sprite_sheet_transparent.png');
