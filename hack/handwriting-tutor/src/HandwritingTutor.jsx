// src/HandwritingTutor.jsx
import React, { useRef, useState, useEffect } from 'react';
// import * as tf from '@tensorflow/tfjs'; // when you add a model in /public/model

export default function HandwritingTutor() {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);

  // processing canvases
  const canvasRef  = useRef(null);  // binary “fresh ink” delta
  const prevRef    = useRef(null);  // previous color frame
  const overlayRef = useRef(null);  // grid + highlight
  const rafRef     = useRef(0);

  const [error, setError] = useState(null);
  const [isActive, setIsActive] = useState(false);

  // 4×5 grid: each cell holds a 64×64 offscreen canvas (accumulated ink)
  const [cells, setCells] = useState(() => Array.from({ length: 20 }, () => null));
  const [lastResult, setLastResult] = useState(null); // {idx,label,conf,tip|msg}

  // -------- Tunables (more sensitive) --------
  const DIFF_THR = 40;   // lower = more sensitive to strokes
  const MIN_RUN  = 80;   // min white pixels to accept a frame
  const CELL_MIN = 10;   // min white pixels to accept a cell update
  // ------------------------------------------

  // const modelRef = useRef(null);
  // useEffect(() => { (async () => {
  //   try { modelRef.current = await tf.loadLayersModel('/model/model.json'); }
  //   catch(e){ console.warn('model load failed (ok for now)', e); }
  // })(); }, []);

  const isSecure = () =>
    window.isSecureContext ||
    location.protocol === 'https:' ||
    /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  const startCamera = async () => {
    setError(null);
    if (!isSecure()) { setError('Use https or http://localhost'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError('getUserMedia not supported'); return; }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsActive(true);
      }
    } catch (err) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Camera blocked. Click the lock icon → Site settings → Camera → Allow.');
      } else if (name === 'NotReadableError') {
        setError('Camera in use by another app/tab. Close Zoom/Meet and retry.');
      } else {
        setError(`Camera error: ${name || err.message}`);
      }
    }
  };

  const resetCells = () => {
    setCells(Array.from({ length: 20 }, () => null));
    setLastResult(null);
  };

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    if (videoRef.current) {
      try { videoRef.current.pause(); } catch {}
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    resetCells();
  };

  // Stop camera on tab hide / unmount
  useEffect(() => {
    const onHide = () => { if (document.hidden) stopCamera(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      stopCamera();
    };
  }, []);

  // ====== REAL-TIME FRAME DIFF + GRID OVERLAY LOOP ======
  useEffect(() => {
    if (!isActive) return;

    const video   = videoRef.current;
    const canvas  = canvasRef.current;
    const prev    = prevRef.current;
    const overlay = overlayRef.current;
    if (!video || !canvas || !prev || !overlay) return;

    const ctx  = canvas.getContext('2d', { willReadFrequently: true });
    const ptx  = prev.getContext('2d',   { willReadFrequently: true });
    const otx  = overlay.getContext('2d');

    const TARGET_W = 640;
    const resize = () => {
      const W = TARGET_W;
      const H = Math.round(W / (16/9));
      [canvas, prev, overlay].forEach(c => { c.width = W; c.height = H; });
    };
    resize();

    const loop = () => {
      const W = overlay.width, H = overlay.height;

      // 1) draw current frame
      ctx.drawImage(video, 0, 0, W, H);

      // 2) binary “fresh ink” delta (current darker than previous)
      const frame = ctx.getImageData(0, 0, W, H);
      const prevFrame = ptx.getImageData(0, 0, W, H);
      const data = frame.data, pdata = prevFrame.data;

      let white = 0;
      for (let i = 0; i < data.length; i += 4) {
        const y  = (data[i]*3 + data[i+1]*4 + data[i+2]) >> 3;
        const py = (pdata[i]*3 + pdata[i+1]*4 + pdata[i+2]) >> 3;
        const on = (py - y) > DIFF_THR ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = on;
        data[i+3] = 255;
        if (on) white++;
      }

      // suppress very small frame changes
      if (white < MIN_RUN) {
        for (let i = 0; i < data.length; i += 4) data[i] = data[i+1] = data[i+2] = 0;
      }

      ctx.putImageData(frame, 0, 0);

      // save current full-color frame as “prev”
      ptx.drawImage(video, 0, 0, W, H);

      // 3) grid overlay
      otx.clearRect(0, 0, W, H);
      otx.strokeStyle = 'rgba(59,130,246,.35)';
      otx.lineWidth = 2;
      for (let i = 1; i <= 4; i++) {
        otx.beginPath(); otx.moveTo((i*W)/4, H*0.1); otx.lineTo((i*W)/4, H*0.9); otx.stroke();
      }
      for (let i = 0; i <= 5; i++) {
        otx.beginPath(); otx.moveTo(W*0.05, H*(0.1+i*0.1333)); otx.lineTo(W*0.95, H*(0.1+i*0.1333)); otx.stroke();
      }

      if (lastResult?.idx != null) {
        const idx = lastResult.idx;
        const cols = 4, rows = 5;
        const cellW = W/cols, cellH = (H*0.8)/rows, y0 = H*0.1, x0 = W*0.05;
        const r = Math.floor(idx/cols), c = idx%cols;
        otx.strokeStyle = 'rgba(34,197,94,.9)'; // green
        otx.lineWidth = 3;
        otx.strokeRect(x0 + c*cellW + 2, y0 + r*cellH + 2, cellW - 4, cellH - 4);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isActive, lastResult?.idx]);

  // ====== 2) GRAB DELTA INTO GRID CELLS (64×64 each) WITH DILATION ======
  const grabCellsFromDelta = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const { width: W, height: H } = cvs;

    const cols = 4, rows = 5;
    const cellW = W / cols, cellH = (H * 0.8) / rows;
    const y0 = H * 0.1, x0 = W * 0.05;

    const next = cells.slice();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (!next[idx]) {
          const off = document.createElement('canvas');
          off.width = 64; off.height = 64;
          next[idx] = off;
        }
        const off = next[idx];
        const octx = off.getContext('2d');

        // Downsample this cell's delta to 64×64 into a temp canvas
        const sx = x0 + c * cellW, sy = y0 + r * cellH;
        const tmp = document.createElement('canvas');
        tmp.width = 64; tmp.height = 64;
        const tctx = tmp.getContext('2d');
        tctx.imageSmoothingEnabled = true;
        tctx.drawImage(cvs, sx, sy, cellW, cellH, 0, 0, 64, 64);

        // --- 1px dilation to thicken faint strokes ---
        const img = tctx.getImageData(0, 0, 64, 64);
        const d = img.data;
        const out = new Uint8ClampedArray(d.length);
        for (let y = 1; y < 63; y++) {
          for (let x = 1; x < 63; x++) {
            let on = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const k = ((y+dy)*64 + (x+dx)) * 4;
                if (d[k] > 128) { on = 255; break; }
              }
              if (on) break;
            }
            const o = (y*64 + x)*4;
            out[o] = out[o+1] = out[o+2] = on;
            out[o+3] = 255;
          }
        }
        // copy edges
        for (let x=0; x<64; x++) {
          const t = (0*64 + x)*4, b = (63*64 + x)*4;
          out[t]=d[t]; out[t+1]=d[t+1]; out[t+2]=d[t+2]; out[t+3]=255;
          out[b]=d[b]; out[b+1]=d[b+1]; out[b+2]=d[b+2]; out[b+3]=255;
        }
        for (let y=0; y<64; y++) {
          const l = (y*64 + 0)*4, rgt = (y*64 + 63)*4;
          out[l]=d[l]; out[l+1]=d[l+1]; out[l+2]=d[l+2]; out[l+3]=255;
          out[rgt]=d[rgt]; out[rgt+1]=d[rgt+1]; out[rgt+2]=d[rgt+2]; out[rgt+3]=255;
        }
        const thick = new ImageData(out, 64, 64);
        tctx.putImageData(thick, 0, 0);

        // count white after dilation; skip pure noise
        const dd = thick.data;
        let wcount = 0;
        for (let i = 0; i < dd.length; i += 4) if (dd[i] > 128) wcount++;
        if (wcount < CELL_MIN) continue;

        // OR-add into accumulation
        octx.save();
        octx.globalCompositeOperation = 'lighter';
        octx.drawImage(tmp, 0, 0);
        octx.restore();
      }
    }
    setCells(next);
  };

  // Auto-capture faster for responsiveness
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      try { grabCellsFromDelta(); } catch {}
    }, 250);
    return () => clearInterval(id);
  }, [isActive]);

  // ====== Utilities (single definition) ======
  const whiteCount = (off) => {
    if (!off) return 0;
    const ctx = off.getContext('2d');
    const { data } = ctx.getImageData(0, 0, 64, 64);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 128) n++;
    return n;
  };

  // ====== Placeholder recognizer (works without TF.js) ======
  const recognizeCellHeuristic = (off) => {
    const ctx = off.getContext('2d');
    const img = ctx.getImageData(0, 0, 64, 64);
    const d = img.data;

    let mass = 0, sx = 0, sy = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const k = (y*64 + x)*4;
        if (d[k] > 128) { mass++; sx += x; sy += y; }
      }
    }
    if (mass < 50) return { label: '?', conf: 0.0 };

    const cx = sx / mass, cy = sy / mass;

    let label = '?', conf = 0.5;
    if (mass > 1200 && mass < 4000) { label = '0'; conf = 0.6; }
    if (mass >= 4000) { label = '8'; conf = 0.55; }
    if (mass > 300 && mass < 1500 && Math.abs(cx-32) < 6) { label = '1'; conf = 0.6; }
    if (mass < 800 && cy < 25) { label = '-'; conf = 0.55; }

    return { label, conf };
  };

  // Heuristics
  const loopClosureTip = (off, label) => {
    if (!['0','6','8','9'].includes(label)) return null;
    const ctx = off.getContext('2d');
    const { data } = ctx.getImageData(0, 0, 64, 64);

    const countRect = (x0,y0,x1,y1) => {
      let n = 0;
      for (let y=y0; y<y1; y++){
        for (let x=x0; x<x1; x++){
          const k = (y*64 + x)*4;
          if (data[k] > 128) n++;
        }
      }
      return n;
    };
    const center = countRect(24,24,40,40);
    const ring   = countRect(8,8,56,56) - center;

    if (ring > center * 3) return null;
    return `Close the loop on your ${label}`;
  };

  const verticalStemTip = (off, label) => {
    if (!['1','4','7'].includes(label)) return null;
    const ctx = off.getContext('2d');
    const { data } = ctx.getImageData(0, 0, 64, 64);

    let sx=0, sy=0, mass=0;
    for (let y=0;y<64;y++){
      for (let x=0;x<64;x++){
        const k=(y*64+x)*4;
        if (data[k]>128){ mass++; sx+=x; sy+=y; }
      }
    }
    if (mass<50) return null;
    const mx=sx/mass, my=sy/mass;

    let sxx=0, syy=0, sxy=0;
    for (let y=0;y<64;y++){
      for (let x=0;x<64;x++){
        const k=(y*64+x)*4;
        if (data[k]>128){
          const dx=x-mx, dy=y-my;
          sxx+=dx*dx; syy+=dy*dy; sxy+=dx*dy;
        }
      }
    }
    const angle = 0.5 * Math.atan2(2*sxy, (sxx - syy));
    const deg = Math.abs(angle * 180 / Math.PI);
    const devFromVertical = Math.abs(90 - deg);
    if (devFromVertical > 20) return 'Keep your stem vertical';
    return null;
  };

  // Classify the most active cell and compute a tip
  const classifyMostActiveCell = async () => {
    let bestIdx = -1, bestWhite = 0;
    for (let i=0;i<cells.length;i++){
      const w = whiteCount(cells[i]);
      if (w > bestWhite) { bestWhite = w; bestIdx = i; }
    }
    if (bestIdx === -1 || bestWhite < 30) {
      setLastResult({ idx: null, label: '—', conf: 0, tip: 'No recent writing captured. Keep writing or let it auto-capture for a moment.' });
      return;
    }
    const off = cells[bestIdx];

    // const { label, conf } = await recognizeCellTF(off);
    const { label, conf } = recognizeCellHeuristic(off);
    const tip = loopClosureTip(off, label) || verticalStemTip(off, label) || null;
    setLastResult({ idx: bestIdx, label, conf: Math.round(conf*100)/100, tip });
  };

  return (
    <div style={{height:'100vh',display:'grid',placeItems:'center',background:'#0b1020',color:'#fff'}}>
      <div style={{width:'90vw',maxWidth:900}}>
        {/* Top status */}
        <div style={{marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div>
            <strong>Status:</strong> {isActive ? 'Camera ON' : 'Camera OFF'}
            {lastResult && (
              <span style={{marginLeft:12}}>
                | <strong>Pred:</strong> {lastResult.label} {typeof lastResult.conf==='number' ? `(${Math.round((lastResult.conf||0)*100)}%)` : ''}
                {lastResult.tip && <span style={{marginLeft:8,color:'#fde68a'}}> • {lastResult.tip}</span>}
              </span>
            )}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={isActive ? stopCamera : startCamera} style={{padding:'8px 12px',borderRadius:8}}>
              {isActive ? 'Stop' : 'Start'}
            </button>
            <button onClick={grabCellsFromDelta} disabled={!isActive} style={{padding:'8px 12px',borderRadius:8}}>
              Capture Δ to cells
            </button>
            <button onClick={classifyMostActiveCell} disabled={!isActive} style={{padding:'8px 12px',borderRadius:8}}>
              Recognize active cell
            </button>
            <button onClick={resetCells} style={{padding:'8px 12px',borderRadius:8}}>
              Reset grid
            </button>
          </div>
        </div>

        {/* Video + canvases */}
        <div
          style={{
            position:'relative',
            width:'100%',
            aspectRatio:'16/9',
            background:'#000',
            borderRadius:12,
            overflow:'hidden'
          }}
        >
          <video
            ref={videoRef}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',background:'#000'}}
            playsInline
            muted
          />
          <canvas ref={canvasRef}  style={{position:'absolute',inset:0,opacity:0,pointerEvents:'none'}} aria-hidden />
          <canvas ref={prevRef}    style={{position:'absolute',inset:0,opacity:0,pointerEvents:'none'}} aria-hidden />
          <canvas ref={overlayRef} style={{position:'absolute',inset:0,pointerEvents:'none'}} />
        </div>

        {/* Debug thumbnails for 20 cells (10×2 grid) */}
        <div style={{marginTop:10,display:'grid',gridTemplateColumns:'repeat(10, 64px)',gap:6,justifyContent:'center'}}>
          {cells.map((off, i) => (
            <div key={i} style={{width:64,height:64,background:'#111',border:'1px solid #333',display:'grid',placeItems:'center',position:'relative'}}>
              {off ? <img src={off.toDataURL()} alt={`cell-${i}`} style={{width:'100%',height:'100%',objectFit:'contain'}}/> : <span style={{fontSize:11,color:'#777'}}>empty</span>}
              {lastResult?.idx === i && (
                <div style={{position:'absolute',inset:0,border:'2px solid #22c55e'}} />
              )}
            </div>
          ))}
        </div>

        {error && <div style={{marginTop:10,color:'#fca5a5'}}>{error}</div>}
      </div>
    </div>
  );
}
