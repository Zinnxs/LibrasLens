import fs from 'fs';
import path from 'path';

const srcDir = path.join(process.cwd(), 'node_modules', '@mediapipe', 'hands');
const destDir = path.join(process.cwd(), 'public', 'mediapipe');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.readdirSync(srcDir).forEach(file => {
  if (file.endsWith('.js') || file.endsWith('.wasm') || file.endsWith('.data') || file.endsWith('.tflite') || file.endsWith('.binarypb')) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    console.log(`Copied ${file} to public/mediapipe/`);
  }
});
