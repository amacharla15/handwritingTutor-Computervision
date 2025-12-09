Handwriting Tutor (Camera + Computer Vision)

Real-time handwriting tutor built with React and raw computer vision.
The app uses your webcam as a "digital whiteboard": it isolates fresh pen strokes, slices the frame into a 4×5 grid, and tracks your handwriting in each cell as 64×64 grayscale images. A lightweight heuristic recognizer (and optional TensorFlow.js model) then gives you instant feedback like:

“Close the loop on your 8”

“Keep your stem vertical”

Originally prototyped during Cal Hacks as a fast way to experiment with on-device handwriting feedback without needing a full backend.

✨ Features

📷 Webcam-based writing surface — point your camera at paper or a whiteboard.

✏️ Frame differencing — detects only fresh ink (new strokes), not the whole page.

🧩 4×5 grid of cells — each cell records strokes as a 64×64 offscreen canvas.

🧠 Pluggable recognizer:

Built-in heuristic recognizer (no ML dependencies).

Optional TensorFlow.js model loaded from /public/model/model.json.

💡 Micro-coaching tips:

Loop closure hints for digits like 0, 6, 8, 9.

Vertical stem hints for digits like 1, 4, 7.

⚙️ Vite + React — fast dev server and easy deployment (GitHub Pages, Netlify, etc.).

🏗 Tech Stack

Frontend: React + Vite

Language: JavaScript / JSX

Computer Vision:

Canvas 2D API

Frame differencing (current vs previous frame)

Simple morphology (1px dilation)

Optional ML: TensorFlow.js model (CNN) exported to /public/model/

Main component: src/HandwritingTutor.jsx

🚀 Getting Started
1. Install dependencies
npm install

2. Run the dev server
npm run dev


Then open the URL Vite prints (usually http://localhost:5173/).

⚠️ Note:
The app needs either:

http://localhost (ok for dev), or

https://your-domain in production
to access the camera. Most browsers block getUserMedia on plain http outside localhost.

When the page loads:

Click Start to enable the camera and grant permission.

Write on a piece of paper in view of the camera.

The app:

Draws a 4×5 grid overlay.

Tracks “fresh ink” as white strokes on a black delta canvas.

Accumulates each cell into 64×64 thumbnails at the bottom.

Click Recognize active cell to run the current recognizer on the most active cell.

🎯 How It Works (High-Level)

Camera input

navigator.mediaDevices.getUserMedia streams video to a <video> element.

Frames are mirrored into two canvases: canvasRef (current) and prevRef (previous frame).

Fresh ink detection (frame differencing)

For each pixel, compute brightness of current vs previous frame.

If the previous pixel is significantly darker than the current pixel ((py - y) > DIFF_THR), mark it as white (ink).

Ignore tiny changes with a per-frame white-pixel threshold (MIN_RUN).

Grid overlay

A 4×5 grid is drawn on overlayRef.

The most recently classified cell is highlighted in green.

Cell accumulation

The delta canvas is sliced into 4×5 regions (cells).

Each cell is downsampled to 64×64.

A small 1px dilation thickens faint strokes.

Noise is dropped if the count of white pixels in a cell is below CELL_MIN.

Valid cells are OR-added into offscreen canvases stored in state (cells).

Recognition + tips

The most active cell is picked by counting white pixels.

A recognizer returns a label and confidence.

Currently implemented as recognizeCellHeuristic(offCanvas).

Can be swapped with a TensorFlow.js CNN.

Simple geometric heuristics compute tips like:

loopClosureTip: checks whether loops are properly closed.

verticalStemTip: checks if the stroke’s main axis is near vertical.

🧪 Optional: Plug in a TensorFlow.js Model

The code already includes commented hooks for TF.js:

// import * as tf from '@tensorflow/tfjs';

// const modelRef = useRef(null);
// useEffect(() => { (async () => {
//   try { modelRef.current = await tf.loadLayersModel('/model/model.json'); }
//   catch(e){ console.warn('model load failed (ok for now)', e); }
// })(); }, []);


To use a real model:

Train a CNN (e.g., on EMNIST, custom digit/character data) to accept 64×64 grayscale images.

Export it with model.save('path/to/model') in TensorFlow.js format.

Place the files under:

public/model/model.json
public/model/group1-shard1ofN.bin
...


Uncomment the TF.js import and model loading code.

Implement a recognizeCellTF(offCanvas) which:

Reads the 64×64 canvas.

Normalizes pixels.

Runs modelRef.current.predict(...).

Returns { label, conf }.

🔮 Ideas / Future Work

Support letters (A–Z) and cursive patterns.

Add training mode with targets per cell (e.g., “Write 5 here, 8 there”).

Store per-user history and display progress over time.

Deploy via GitHub Pages / Netlify with HTTPS and a hosted TF.js model.

Add audio feedback (“Good 8!” / “Close the loop more.”).


👤 Author

Built by Akshith Macharla
Originally prototyped at Cal Hacks as a real-time handwriting feedback experiment.
