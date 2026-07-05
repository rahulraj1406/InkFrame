import * as tflite from '@tensorflow/tfjs-tflite';
import * as tf from '@tensorflow/tfjs';
import { orderPanels } from './ordering';
import { planPanels } from './planner';

export interface Panel {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface DetectResult {
  panels: Panel[];
  bubbles: Panel[];
  pageW: number;
  pageH: number;
}

interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
  newW: number;
  newH: number;
}

const DEFAULT_INPUT_SIZE = 640;
const DEFAULT_CONFIDENCE = 0.25;
const DEFAULT_NMS_IOU = 0.45;
const DEFAULT_CONTAINMENT = 0.6;
const DEFAULT_MIN_AREA_FRACTION = 0.008;
const PANEL_CLASS = 0;
const TEXT_CLASS = 1;

let model: tflite.TFLiteModel | null = null;

export async function initDetector() {
  if (model) return;
  // Point the WASM loader at the runtime assets copied from
  // node_modules/@tensorflow/tfjs-tflite/wasm/ into public/tflite-wasm/.
  // Without this, the library falls back to locating them relative to the
  // bundled script's own URL, which fails inside a webpack chunk.
  tflite.setWasmPath('/tflite-wasm/');
  // numThreads: 1 works around a long-standing tfjs-tflite bug where its
  // default multi-threaded WASM setup hangs predict() indefinitely
  // (see tensorflow/tfjs#7055, #6094) instead of throwing or completing.
  model = await tflite.loadTFLiteModel('/manga_panel_detector_int8.tflite', { numThreads: 1 });
  console.log('TFLite model loaded', model);
}

function calculateLetterbox(pageW: number, pageH: number, inputSize: number): Letterbox {
  const scale = Math.min(inputSize / pageW, inputSize / pageH);
  const newW = Math.max(1, Math.floor(pageW * scale));
  const newH = Math.max(1, Math.floor(pageH * scale));
  return {
    scale,
    padX: Math.floor((inputSize - newW) / 2),
    padY: Math.floor((inputSize - newH) / 2),
    newW,
    newH
  };
}

export async function detectPanels(imgElement: HTMLImageElement): Promise<DetectResult> {
  if (!model) throw new Error('Detector not initialized');

  const pageW = imgElement.naturalWidth;
  const pageH = imgElement.naturalHeight;
  const lb = calculateLetterbox(pageW, pageH, DEFAULT_INPUT_SIZE);

  // Preprocess: Resize and letterbox using Canvas
  const canvas = document.createElement('canvas');
  canvas.width = DEFAULT_INPUT_SIZE;
  canvas.height = DEFAULT_INPUT_SIZE;
  const ctx = canvas.getContext('2d')!;
  
  // Fill with YOLO letterbox gray
  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, DEFAULT_INPUT_SIZE, DEFAULT_INPUT_SIZE);
  
  // Draw the image centered
  ctx.drawImage(imgElement, lb.padX, lb.padY, lb.newW, lb.newH);

  // Convert canvas to tensor
  let inputTensor = tf.browser.fromPixels(canvas);
  inputTensor = inputTensor.expandDims(0); // [1, 640, 640, 3]

  // Convert to INT8 if the model expects it, but tfjs-tflite handles normalization automatically for float models.
  // Assuming the int8 model accepts float32 or int8 input depending on metadata.
  // We'll pass it as int32 and cast to int8/float depending on model input requirements.
  const inputInfo = model.inputs[0];
  if (inputInfo.dtype === 'int32') {
     // @tensorflow/tfjs-tflite represents some quantized inputs as int32
     const intTensor = tf.cast(inputTensor, 'int32');
     inputTensor.dispose();
     inputTensor = intTensor;
  }

  // Run inference
  const outputResult = model.predict(inputTensor as any);
  const outputTensor = (Array.isArray(outputResult) ? outputResult[0] :
                       (outputResult instanceof tf.Tensor ? outputResult : Object.values(outputResult as any)[0])) as tf.Tensor;
  const raw = await outputTensor.data();
  const shape = outputTensor.shape; // e.g. [1, 6, 8400] or [1, 8400, 6]

  inputTensor.dispose();
  outputTensor.dispose();

  const result = decodeYoloOutput(raw, shape, lb, pageW, pageH);
  
  // Apply advanced ordering and planning (merging/dividing)
  const isRTL = false; // Default reading direction
  const orderedPanels = orderPanels(result.panels, isRTL);
  const plannedPanels = planPanels(orderedPanels, result.bubbles, pageW, pageH, isRTL);
  
  result.panels = plannedPanels;
  return result;
}

function decodeYoloOutput(raw: Float32Array | Int32Array | Uint8Array, shape: number[], lb: Letterbox, pageW: number, pageH: number): DetectResult {
  if (shape.length !== 3) return { panels: [], bubbles: [], pageW, pageH };
  
  const d1 = shape[1];
  const d2 = shape[2];
  const transposed = d1 < d2;
  const attrs = transposed ? d1 : d2;
  const preds = transposed ? d2 : d1;
  
  const at = (pred: number, attr: number) => {
    return transposed ? raw[attr * preds + pred] : raw[pred * attrs + attr];
  };

  if (attrs < 6) return { panels: [], bubbles: [], pageW, pageH };
  const endToEnd = preds <= 1000;

  // Normalization detection
  let maxCoord = 0;
  let sampled = 0;
  for (let p = 0; p < preds && sampled < 64; p++) {
    const v = Math.max(at(p, 0), at(p, 1), at(p, 2), at(p, 3));
    if (isFinite(v)) {
      maxCoord = Math.max(maxCoord, v);
      sampled++;
    }
  }
  const coordScale = maxCoord <= 1.5 ? DEFAULT_INPUT_SIZE : 1.0;

  const panelBoxes: number[][] = [];
  const bubbleBoxes: number[][] = [];

  for (let i = 0; i < preds; i++) {
    let cls: number;
    let score: number;

    if (endToEnd) {
      score = at(i, 4);
      cls = at(i, 5);
    } else {
      const cls0 = at(i, 4);
      const cls1 = at(i, 5);
      if (cls0 >= cls1) {
        cls = PANEL_CLASS;
        score = cls0;
      } else {
        cls = TEXT_CLASS;
        score = cls1;
      }
    }

    if (score < DEFAULT_CONFIDENCE || (cls !== PANEL_CLASS && cls !== TEXT_CLASS)) continue;

    const a = at(i, 0) * coordScale;
    const b = at(i, 1) * coordScale;
    const c = at(i, 2) * coordScale;
    const d = at(i, 3) * coordScale;

    let x1, y1, x2, y2;
    if (endToEnd) {
      x1 = a; y1 = b; x2 = c; y2 = d;
    } else {
      x1 = a - c / 2;
      y1 = b - d / 2;
      x2 = a + c / 2;
      y2 = b + d / 2;
    }

    const box = [x1, y1, x2, y2, score];
    if (cls === PANEL_CLASS) panelBoxes.push(box);
    else bubbleBoxes.push(box);
  }

  const panels = toPanels(suppress(panelBoxes), lb, pageW, pageH, DEFAULT_MIN_AREA_FRACTION);
  const bubbles = toPanels(suppress(bubbleBoxes), lb, pageW, pageH, 0);

  return { panels, bubbles, pageW, pageH };
}

function toPanels(boxes: number[][], lb: Letterbox, pageW: number, pageH: number, minAreaFrac: number): Panel[] {
  const minArea = minAreaFrac * DEFAULT_INPUT_SIZE * DEFAULT_INPUT_SIZE;
  const panels: Panel[] = [];

  for (const box of boxes) {
    const w = Math.max(0, box[2] - box[0]);
    const h = Math.max(0, box[3] - box[1]);
    if (w * h < minArea) continue;

    const l = Math.max(0, Math.min(1, (box[0] - lb.padX) / lb.scale / pageW));
    const t = Math.max(0, Math.min(1, (box[1] - lb.padY) / lb.scale / pageH));
    const r = Math.max(0, Math.min(1, (box[2] - lb.padX) / lb.scale / pageW));
    const bo = Math.max(0, Math.min(1, (box[3] - lb.padY) / lb.scale / pageH));

    if (r > l && bo > t) {
      panels.push({ l, t, r, b: bo });
    }
  }
  return panels;
}

function suppress(boxes: number[][]): number[][] {
  const sorted = boxes.sort((a, b) => b[4] - a[4]);
  let kept: number[][] = [];

  for (const box of sorted) {
    const redundant = kept.some(k => iou(k, box) > DEFAULT_NMS_IOU || containedFraction(box, k) > DEFAULT_CONTAINMENT);
    if (redundant) continue;

    kept = kept.filter(k => containedFraction(k, box) <= DEFAULT_CONTAINMENT);
    kept.push(box);
  }
  return kept;
}

function containedFraction(inner: number[], outer: number[]): number {
  const ix = Math.max(0, Math.min(inner[2], outer[2]) - Math.max(inner[0], outer[0]));
  const iy = Math.max(0, Math.min(inner[3], outer[3]) - Math.max(inner[1], outer[1]));
  const inter = ix * iy;
  const innerArea = (inner[2] - inner[0]) * (inner[3] - inner[1]);
  return innerArea <= 0 ? 0 : inter / innerArea;
}

function iou(a: number[], b: number[]): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}
