import React, { useRef, useState, useEffect, useCallback } from 'react';

export default function ROICanvas({ imageSrc, initialRois = [], onROIComplete }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [rois, setRois] = useState(initialRois);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setRois(initialRois);
  }, [initialRois]);

  // Load image and setup canvas
  useEffect(() => {
    if (!imageSrc) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      imgRef.current = img;
      redraw();
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw when rois change
  useEffect(() => {
    if (imgRef.current) redraw();
  }, [rois]);

  const redraw = useCallback((currentRect = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0);

    // Draw saved ROIs
    rois.forEach((roi) => {
      ctx.strokeStyle = '#10b981'; // var(--color-accent-green)
      ctx.lineWidth = 3;
      ctx.strokeRect(roi.x1, roi.y1, roi.x2 - roi.x1, roi.y2 - roi.y1);
      
      // Label
      if (roi.slot_id) {
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(roi.slot_id, roi.x1, Math.max(20, roi.y1 - 5));
      }
    });

    // Draw active rectangle
    if (currentRect) {
      ctx.strokeStyle = '#3b82f6'; // var(--color-accent-blue)
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(currentRect.x1, currentRect.y1, currentRect.x2 - currentRect.x1, currentRect.y2 - currentRect.y1);
      ctx.setLineDash([]);
    }
  }, [rois]);

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e) => {
    const pos = getMousePos(e);
    setStartPos(pos);
    setIsDrawing(true);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);
    
    const currentRect = {
      x1: Math.min(startPos.x, pos.x),
      y1: Math.min(startPos.y, pos.y),
      x2: Math.max(startPos.x, pos.x),
      y2: Math.max(startPos.y, pos.y),
    };
    
    redraw(currentRect);
  };

  const handleMouseUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    const pos = getMousePos(e);
    const newRoi = {
      x1: Math.round(Math.min(startPos.x, pos.x)),
      y1: Math.round(Math.min(startPos.y, pos.y)),
      x2: Math.round(Math.max(startPos.x, pos.x)),
      y2: Math.round(Math.max(startPos.y, pos.y)),
    };

    // Ignore tiny boxes (accidental clicks)
    if (newRoi.x2 - newRoi.x1 > 10 && newRoi.y2 - newRoi.y1 > 10) {
      if (onROIComplete) onROIComplete(newRoi);
    } else {
      redraw(); // Clear the tiny box
    }
  };

  if (!imageSrc) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-[var(--color-bg-secondary)] border border-dashed border-[var(--color-border)] rounded-lg">
        <p className="text-[var(--color-text-muted)]">Upload an image or connect a camera to draw ROIs</p>
      </div>
    );
  }

  return (
    <div className="relative w-full border border-[var(--color-border)] rounded-lg bg-black">
      {/* Zoom Controls Overlay */}
      <div className="absolute top-2 right-2 flex gap-2 bg-[var(--color-bg-secondary)] p-2 rounded-lg border border-[var(--color-border)] z-10 opacity-80 hover:opacity-100 transition-opacity">
        <button onClick={() => setZoom(z => Math.max(1, z - 0.25))} className="w-8 h-8 flex items-center justify-center bg-[var(--color-bg-primary)] hover:bg-[var(--color-accent-blue)] rounded text-white font-bold">-</button>
        <span className="flex items-center text-sm font-mono w-12 justify-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="w-8 h-8 flex items-center justify-center bg-[var(--color-bg-primary)] hover:bg-[var(--color-accent-blue)] rounded text-white font-bold">+</button>
        <button onClick={() => setZoom(1)} className="px-2 h-8 flex items-center justify-center bg-[var(--color-bg-primary)] hover:bg-[var(--color-accent-blue)] rounded text-white text-xs">RESET</button>
      </div>

      <div ref={containerRef} className="w-full h-[600px] overflow-auto custom-scrollbar">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isDrawing) {
              setIsDrawing(false);
              redraw();
            }
          }}
          className="cursor-crosshair transition-all duration-200"
          style={{ width: `${100 * zoom}%`, height: 'auto', minWidth: '100%' }}
        />
      </div>
    </div>
  );
}
