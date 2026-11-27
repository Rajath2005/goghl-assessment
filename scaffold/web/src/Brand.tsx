import { useEffect, useRef } from 'react';

export function Brand() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span>Switchboard</span>;
}

// An original patch-panel illustration, drawn in logical coordinates so the
// same artwork stays sharp on small screens and high-density displays.
export function PatchPanel() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current!;
    const paint = () => {
      const { width, height } = el.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio, 2);
      el.width = width * ratio; el.height = height * ratio;
      const c = el.getContext('2d');
      if (!c) return;
      const scale = Math.min(width / 520, height / 550);
      c.scale(ratio, ratio);
      c.translate((width - 520 * scale) / 2, (height - 550 * scale) / 2);
      c.scale(scale, scale);
      const dot = (x: number, y: number, r: number, color: string) => {
        c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      };
      const panel = (x: number, y: number) => {
        c.fillStyle = '#2b43ab'; c.beginPath(); c.roundRect(x, y + 8, 354, 119, 9); c.fill();
        c.fillStyle = '#e6ebfe'; c.beginPath(); c.roundRect(x, y, 354, 119, 9); c.fill();
        for (const dx of [12, 342]) for (const dy of [12, 107]) {
          dot(x + dx, y + dy, 3, '#9daacf');
        }
        for (let i = 0; i < 6; i++) {
          const px = x + 42 + i * 54;
          dot(px, y + 52, 16, '#b6c2e3'); dot(px, y + 52, 12, '#40517a'); dot(px, y + 52, 7, '#202d4b');
          c.fillStyle = '#9ca8ca'; c.fillRect(px - 6, y + 84, 12, 3);
        }
      };
      panel(39, 71); panel(112, 340);
      const cable = (x: number, y: number, endX: number, endY: number, bend: number, color: string) => {
        c.lineCap = 'round';
        for (const [stroke, width, offset] of [['#243991', 14, 6], [color, 12, 0]] as const) {
          c.strokeStyle = stroke; c.lineWidth = width; c.beginPath(); c.moveTo(x, y + offset);
          c.bezierCurveTo(x, y + bend + offset, endX, endY + bend + offset, endX, endY + offset); c.stroke();
        }
        for (const [px, py] of [[x,y],[endX,endY]]) {
          dot(px, py, 10, color); c.fillStyle = color; c.fillRect(px - 8, py, 16, 21);
          c.fillStyle = '#0003'; for (let k = 0; k < 3; k++) c.fillRect(px - 8, py + 10 + k * 4, 16, 1.5);
        }
      };
      cable(135, 123, 208, 392, 167, '#ffbc61');
      cable(297, 123, 424, 392, 113, '#9baeff');
      cable(189, 123, 316, 392, 145, '#fb7958');
    };
    const observer = new ResizeObserver(paint); observer.observe(el); paint();
    return () => observer.disconnect();
  }, []);
  return <canvas ref={canvas} className="patch-panel" aria-hidden="true"/>;
}
