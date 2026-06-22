import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

async function test() {
  const model = handPoseDetection.SupportedModels.MediaPipeHands;
  const detectorConfig = {
    runtime: 'mediapipe',
    solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240',
    modelType: 'lite',
    maxHands: 1,
  } as handPoseDetection.MediaPipeHandsMediaPipeModelConfig;

  try {
    const detector = await handPoseDetection.createDetector(model, detectorConfig);
    console.log("SUCCESS");
  } catch(e) {
    console.error("FAIL", e);
  }
}
test();
