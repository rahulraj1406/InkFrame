import type { Panel } from './detector';

export interface PlannerConfig {
  smallAreaFraction: number;
  bigAreaFraction: number;
  squareAspectLow: number;
  squareAspectHigh: number;
  adjacencyGap: number;
  adjacencyOverlap: number;
  maxMergeCount: number;
  maxMergedWidthFraction: number;
  maxMergedHeightFraction: number;
  cutCentralMin: number;
  cutCentralMax: number;
  fullWidthFraction: number;
  broadHeightFraction: number;
  minDivideHeightFraction: number;
  spreadAspectMin: number;
  crossPageWidthFraction: number;
  spreadPageWidthFraction: number;
}

const DEFAULT_CONFIG: PlannerConfig = {
  smallAreaFraction: 0.10,
  bigAreaFraction: 0.35,
  squareAspectLow: 0.8,
  squareAspectHigh: 1.25,
  adjacencyGap: 0.05,
  adjacencyOverlap: 0.4,
  maxMergeCount: 3,
  maxMergedWidthFraction: 0.55,
  maxMergedHeightFraction: 0.45,
  cutCentralMin: 0.30,
  cutCentralMax: 0.70,
  fullWidthFraction: 0.85,
  broadHeightFraction: 0.55,
  minDivideHeightFraction: 0.10,
  spreadAspectMin: 1.15,
  crossPageWidthFraction: 0.85,
  spreadPageWidthFraction: 0.42,
};

interface Region {
  panel: Panel;
  merged: boolean;
}

enum Dir {
  NONE, HORIZONTAL, VERTICAL
}

// Extends Panel with computed properties
function area(p: Panel): number {
  return (p.r - p.l) * (p.b - p.t);
}

function width(p: Panel): number {
  return p.r - p.l;
}

function height(p: Panel): number {
  return p.b - p.t;
}

function centerX(p: Panel): number {
  return (p.l + p.r) / 2;
}

function centerY(p: Panel): number {
  return (p.t + p.b) / 2;
}

export function planPanels(
  ordered: Panel[],
  bubbles: Panel[],
  pageW: number,
  pageH: number,
  rightToLeft: boolean,
  config: PlannerConfig = DEFAULT_CONFIG
): Panel[] {
  if (ordered.length === 0) return ordered;
  const pageAspect = pageW / pageH;

  const merged = mergeSmall(ordered, config);
  const result: Panel[] = [];
  
  for (const region of merged) {
    const p = region.panel;
    if (!region.merged && shouldDivide(p, pageAspect, config)) {
      result.push(...divide(p, bubbles, pageAspect, rightToLeft, config));
    } else {
      result.push(p);
    }
  }
  
  return result;
}

function mergeSmall(ordered: Panel[], config: PlannerConfig): Region[] {
  const regions: Region[] = [];
  let i = 0;
  
  while (i < ordered.length) {
    const cur = ordered[i];
    if (!isSmall(cur, config)) {
      regions.push({ panel: cur, merged: false });
      i++;
      continue;
    }
    
    let unionP = cur;
    let j = i;
    let count = 1;
    let dir = Dir.NONE;
    
    while (j + 1 < ordered.length && count < config.maxMergeCount && isSmall(ordered[j + 1], config)) {
      const next = ordered[j + 1];
      const stepDir = adjacencyDir(ordered[j], next, config);
      
      if (stepDir === Dir.NONE) break;
      if (dir === Dir.NONE) dir = stepDir;
      else if (stepDir !== dir) break;
      
      const candidate = union(unionP, next);
      if (width(candidate) > config.maxMergedWidthFraction || height(candidate) > config.maxMergedHeightFraction) {
        break;
      }
      
      unionP = candidate;
      j++;
      count++;
    }
    
    regions.push({ panel: unionP, merged: count > 1 });
    i = j + 1;
  }
  
  return regions;
}

function shouldDivide(p: Panel, pageAspect: number, c: PlannerConfig): boolean {
  const spread = isSpread(pageAspect, c);
  if (spread && isCrossPage(p, c)) return true;
  if (isFullWidth(p, c, spread) && height(p) >= c.minDivideHeightFraction) return true;
  return isBig(p, c) && !isSquare(p, pageAspect, c);
}

function divide(p: Panel, bubbles: Panel[], pageAspect: number, rtl: boolean, config: PlannerConfig): Panel[] {
  if (isSpread(pageAspect, config) && isCrossPage(p, config)) {
    const rows = height(p) >= config.broadHeightFraction ? 2 : 1;
    return gridSplit(p, 4, rows, rtl);
  }
  
  if (isFullWidth(p, config, isSpread(pageAspect, config))) {
    return splitByBreadth(p, bubbles, rtl, config);
  }
  
  return classicDivide(p, bubbles, pageAspect, rtl, config);
}

function gridSplit(p: Panel, cols: number, rows: number, rtl: boolean): Panel[] {
  const cw = width(p) / cols;
  const rh = height(p) / rows;
  const pieces: Panel[] = [];
  
  for (let r = 0; r < rows; r++) {
    const top = r === 0 ? p.t : p.t + r * rh;
    const bottom = r === rows - 1 ? p.b : p.t + (r + 1) * rh;
    
    const colOrder = rtl ? Array.from({length: cols}, (_, i) => cols - 1 - i) : Array.from({length: cols}, (_, i) => i);
    
    for (const c of colOrder) {
      const left = c === 0 ? p.l : p.l + c * cw;
      const right = c === cols - 1 ? p.r : p.l + (c + 1) * cw;
      pieces.push({ l: left, t: top, r: right, b: bottom });
    }
  }
  
  return pieces;
}

function splitByBreadth(p: Panel, bubbles: Panel[], rtl: boolean, config: PlannerConfig): Panel[] {
  const inside = bubblesInside(p, bubbles);
  if (height(p) >= config.broadHeightFraction) {
    return quarter(p, inside, rtl, config);
  } else {
    return halveLeftRight(p, inside, rtl, config);
  }
}

function halveLeftRight(p: Panel, inside: Panel[], rtl: boolean, config: PlannerConfig): Panel[] {
  const cut = cutPosition(inside.map(b => b.l), inside.map(b => b.r), p.l, p.r, config);
  const left = { l: p.l, t: p.t, r: cut, b: p.b };
  const right = { l: cut, t: p.t, r: p.r, b: p.b };
  return rtl ? [right, left] : [left, right];
}

function quarter(p: Panel, inside: Panel[], rtl: boolean, config: PlannerConfig): Panel[] {
  const vCut = cutPosition(inside.map(b => b.l), inside.map(b => b.r), p.l, p.r, config);
  const hCut = cutPosition(inside.map(b => b.t), inside.map(b => b.b), p.t, p.b, config);
  
  const tl = { l: p.l, t: p.t, r: vCut, b: hCut };
  const tr = { l: vCut, t: p.t, r: p.r, b: hCut };
  const bl = { l: p.l, t: hCut, r: vCut, b: p.b };
  const br = { l: vCut, t: hCut, r: p.r, b: p.b };
  
  return rtl ? [tr, tl, br, bl] : [tl, tr, bl, br];
}

function classicDivide(p: Panel, bubbles: Panel[], pageAspect: number, rtl: boolean, config: PlannerConfig): Panel[] {
  const inside = bubblesInside(p, bubbles);
  if (realAspect(p, pageAspect) >= config.squareAspectHigh) {
    return halveLeftRight(p, inside, rtl, config);
  } else {
    const cut = cutPosition(inside.map(b => b.t), inside.map(b => b.b), p.t, p.b, config);
    return [
      { l: p.l, t: p.t, r: p.r, b: cut },
      { l: p.l, t: cut, r: p.r, b: p.b }
    ];
  }
}

function bubblesInside(p: Panel, bubbles: Panel[]): Panel[] {
  return bubbles.filter(b => {
    const cx = centerX(b);
    const cy = centerY(b);
    return cx >= p.l && cx <= p.r && cy >= p.t && cy <= p.b;
  });
}

function cutPosition(lowEdges: number[], highEdges: number[], start: number, end: number, config: PlannerConfig): number {
  const center = (start + end) / 2;
  const lo = start + (end - start) * config.cutCentralMin;
  const hi = start + (end - start) * config.cutCentralMax;
  
  if (lowEdges.length >= 2) {
    const spans = lowEdges.map((l, i) => [l, highEdges[i]]).sort((a, b) => a[0] - b[0]);
    let bestGap = 0;
    let bestMid = center;
    let cursor = spans[0][1];
    
    for (let k = 1; k < spans.length; k++) {
      const nextLow = spans[k][0];
      const nextHigh = spans[k][1];
      const gap = nextLow - cursor;
      
      if (gap > bestGap) {
        bestGap = gap;
        bestMid = (cursor + nextLow) / 2;
      }
      cursor = Math.max(cursor, nextHigh);
    }
    
    if (bestGap > 0 && bestMid >= lo && bestMid <= hi) return bestMid;
  }
  
  return Math.min(Math.max(center, lo), hi);
}

function isSmall(p: Panel, c: PlannerConfig) { return area(p) < c.smallAreaFraction; }
function isBig(p: Panel, c: PlannerConfig) { return area(p) > c.bigAreaFraction; }
function isFullWidth(p: Panel, c: PlannerConfig, spread: boolean) { return width(p) >= (spread ? c.spreadPageWidthFraction : c.fullWidthFraction); }
function isSpread(pageAspect: number, c: PlannerConfig) { return pageAspect >= c.spreadAspectMin; }
function isCrossPage(p: Panel, c: PlannerConfig) { return width(p) >= c.crossPageWidthFraction; }

function realAspect(p: Panel, pageAspect: number): number {
  if (height(p) <= 0) return 1;
  return (width(p) / height(p)) * pageAspect;
}

function isSquare(p: Panel, pageAspect: number, c: PlannerConfig): boolean {
  const a = realAspect(p, pageAspect);
  return a >= c.squareAspectLow && a <= c.squareAspectHigh;
}

function adjacencyDir(a: Panel, b: Panel, c: PlannerConfig): Dir {
  const vOverlap = overlap(a.t, a.b, b.t, b.b) / Math.max(Math.min(height(a), height(b)), 1e-4);
  const hOverlap = overlap(a.l, a.r, b.l, b.r) / Math.max(Math.min(width(a), width(b)), 1e-4);
  const hGap = Math.max(Math.max(a.l, b.l) - Math.min(a.r, b.r), 0);
  const vGap = Math.max(Math.max(a.t, b.t) - Math.min(a.b, b.b), 0);
  
  const sideBySide = vOverlap >= c.adjacencyOverlap && hGap <= c.adjacencyGap;
  const stacked = hOverlap >= c.adjacencyOverlap && vGap <= c.adjacencyGap;
  
  if (sideBySide && stacked) return hGap <= vGap ? Dir.HORIZONTAL : Dir.VERTICAL;
  if (sideBySide) return Dir.HORIZONTAL;
  if (stacked) return Dir.VERTICAL;
  return Dir.NONE;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(Math.min(a1, b1) - Math.max(a0, b0), 0);
}

function union(a: Panel, b: Panel): Panel {
  return {
    l: Math.min(a.l, b.l),
    t: Math.min(a.t, b.t),
    r: Math.max(a.r, b.r),
    b: Math.max(a.b, b.b)
  };
}
