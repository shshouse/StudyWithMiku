import * as mm from 'music-metadata';
import fs from 'fs';
import path from 'path';

const musicDir = 'public/SpecialMusic';

async function extractCover(filePath) {
  try {
    const metadata = await mm.parseFile(filePath);
    const picture = metadata.common.picture?.[0];
    
    if (picture) {
      const ext = picture.format.includes('png') ? 'png' : 'jpg';
      const baseName = path.basename(filePath, path.extname(filePath));
      const coverPath = path.join(musicDir, `${baseName}.cover.${ext}`);
      
      fs.writeFileSync(coverPath, picture.data);
      console.log(`Extracted: ${baseName}.cover.${ext}`);
    } else {
      console.log(`No cover found: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
  }
}

async function main() {
  const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'));
  
  for (const file of files) {
    await extractCover(path.join(musicDir, file));
  }
  
  console.log('Done!');
}

main();
