import type { Panel } from './detector';

const STRADDLE_TOLERANCE = 0.25;
const ROW_BAND = 0.12;

export function orderPanels(panels: Panel[], rightToLeft: boolean = false): Panel[] {
  if (panels.length <= 1) return panels;
  return cut(panels, rightToLeft);
}

function cut(panels: Panel[], rightToLeft: boolean): Panel[] {
  if (panels.length <= 1) return panels;

  const horizontalCut = findCut(panels, false);
  if (horizontalCut) {
    const [top, bottom] = horizontalCut;
    return [...cut(top, rightToLeft), ...cut(bottom, rightToLeft)];
  }

  const verticalCut = findCut(panels, true);
  if (verticalCut) {
    const [left, right] = verticalCut;
    if (rightToLeft) {
      return [...cut(right, rightToLeft), ...cut(left, rightToLeft)];
    } else {
      return [...cut(left, rightToLeft), ...cut(right, rightToLeft)];
    }
  }

  // Fallback clustering
  const byTop = [...panels].sort((a, b) => a.t - b.t);
  const rows: Panel[][] = [];
  
  for (const p of byTop) {
    const row = rows.length > 0 ? rows[rows.length - 1] : null;
    if (row && p.t - row[0].t <= ROW_BAND) {
      row.push(p);
    } else {
      rows.push([p]);
    }
  }
  
  return rows.flatMap(row => 
    row.sort((a, b) => rightToLeft ? b.l - a.l : a.l - b.l)
  );
}

function findCut(panels: Panel[], vertical: boolean): [Panel[], Panel[]] | null {
  const start = (p: Panel) => vertical ? p.l : p.t;
  const end = (p: Panel) => vertical ? p.r : p.b;

  const maxEnd = Math.max(...panels.map(end));
  const candidates = Array.from(new Set(panels.map(end))).sort((a, b) => a - b);
  
  for (const line of candidates) {
    if (line >= maxEnd) continue;
    
    const first: Panel[] = [];
    const second: Panel[] = [];
    let valid = true;
    
    for (const p of panels) {
      const s = start(p);
      const e = end(p);
      
      if (e <= line) {
        first.push(p);
      } else if (s >= line) {
        second.push(p);
      } else {
        const len = Math.max(e - s, 1e-4);
        const crossDepth = Math.min(e - line, line - s);
        if (crossDepth / len > STRADDLE_TOLERANCE) {
          valid = false;
          break;
        }
        if (line - s >= e - line) {
          first.push(p);
        } else {
          second.push(p);
        }
      }
    }
    
    if (valid && first.length > 0 && second.length > 0) {
      return [first, second];
    }
  }
  
  return null;
}
