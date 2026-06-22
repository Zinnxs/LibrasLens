import { guessGesture } from './src/utils/gesture';
import * as tf from '@tensorflow/tfjs';
import * as hpd from '@tensorflow-models/hand-pose-detection';

const kp = [];
for (let i = 0; i < 21; i++) {
  kp.push({x: i, y: i, z: i});
}

console.log(guessGesture(kp));
