// Line icons of the workshop's tools (24 × 24, drawn with the current colour), so
// each tool is recognised at a glance in the tool chest, the drill and saw
// racks and the CNC tool rack. toolIcon(name) takes a tool chest id
// (tool-chest.mjs), a cutter form (tool-models.js cutterForm: twist, brad,
// forstner, upcut, downcut, compression, straight) or saw, dado, router.
const SAW_TEETH='M3 14l1 1.4L5 14l1 1.4L7 14l1 1.4L9 14l1 1.4L11 14l1 1.4L13 14l1 1.4L15 14';
const PANEL_SAW='M3 7l13-3v10H3zM16 4h5v10h-5M18 7h1'+SAW_TEETH;
const BACK_SAW='M3 5h13v3H3zM3 8h13v6H3zM16 5h5v9h-5'+SAW_TEETH;
const BENCH_PLANE='M2 16h20v3H2zM4 16c0-2.5 1.5-4 4-4v4M12 16l2-6M15 16l2-9 2.5.8L18 16';
const CHISEL='M10 2h4v8h-4zM9 10h6v1.5H9z';
const SHANK='M10 2h4v8h-4z';
const ICONS={
  rule:'M3 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0M9 12h.01M9 18h12v-3',
  'try-square':'M4 3h4v18H4zM8 16h13v3H8z',
  'combination-square':'M2 15h20v3H2zM6 8h7v10H6zM8 11h3',
  'marking-gauge':'M2 11h19v3H2zM12 5h4v15h-4zM21 14v3',
  'cutting-gauge':'M2 11h19v3H2zM12 5h4v15h-4zM20 14l1 3 1-3',
  'mortise-gauge':'M2 11h19v3H2zM12 5h4v15h-4zM19 14v3M21 14v3M4 9.5h6',
  'marking-knife':'M2 14h10v3H2zM12 14h4l6-5-1-1-9 4',
  dividers:'M12 2v3M12 5L6 22M12 5l6 17M8.5 14h7',
  awl:'M4 20l6-6M10 14l3-3 2 2-3 3zM15 9l6-6',
  'sliding-bevel':'M3 15h11v4H3zM12 15L20 4l1.6 1.2L14 16',
  'winding-sticks':'M2 8h20v3H2zM2 14h20v3H2z',
  'panel-saw-crosscut':PANEL_SAW,'panel-saw-rip':PANEL_SAW,
  'carcass-saw':BACK_SAW,'tenon-saw':BACK_SAW,'dovetail-saw':BACK_SAW,
  'coping-saw':'M6 16V5h12v11M5 16h14M12 16v2M11 18h2v4h-2z',
  'jack-plane':BENCH_PLANE,'smoothing-plane':BENCH_PLANE,'jointer-plane':BENCH_PLANE,
  'block-plane':'M4 14h16v4H4zM7 14a5 3 0 0 1 10 0M10 11l3 3',
  'rabbet-plane':'M3 12h15v6H3zM3 18h15v2H3M18 12l3-5',
  'plough-plane':'M3 10h14v7H3zM5 20h16M6 17v3M16 17v3M17 10l3-5',
  'router-plane':'M2 16h20v2H2zM5 16v-4a2 2 0 0 1 4 0v4M15 16v-4a2 2 0 0 1 4 0v4M12 16v5',
  'shoulder-plane':'M5 9h14v9H5zM8 9a4 4 0 0 1 8 0M10 18l2 3 2-3',
  'card-scraper':'M4 6h16v12H4zM7 9h10',
  'bench-chisels':CHISEL+'M10.5 11.5h3V21l-1.5 1-1.5-1z',
  'mortise-chisel':CHISEL+'M9.5 11.5h5V22h-5z',
  'paring-chisel':'M10.5 2h3v6h-3zM10 8h4v1h-4zM11 9h2v13h-2z',
  'brace-and-bits':'M10 2h4v2h-4zM12 4v3H7v7h5v8M6 9h2v3H6z',
  'hand-drill':'M12 3v19M9 3h6M17 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8M21 12h2',
  gimlet:'M5 4h14v3H5zM12 7v14M10 10l4 2M10 14l4 2M10 18l4 2',
  mallet:'M4 4h11v6H4zM9.5 10v11',
  spokeshave:'M2 12h6M16 12h6M8 10h8v4H8z',
  'rasps-files':'M5 19L19 5M7 21l-4-4M9 15l2 2M12 12l2 2M15 9l2 2',
  brush:'M8 13h8v8H8zM9 10h6v3H9zM11 2h2v8h-2z',
  'shooting-board':'M2 17h20v3H2zM8 13h14v4H8zM2 13h4v4',
  'bench-hook':'M3 10h18v4H3zM3 10V6h3v4M18 14v4h3v-4',
  'holdfast-vise':'M6 21V7a4 4 0 0 1 4-4h9v3h-8v15',
  clamps:'M5 3v18M5 3h11M5 21h11M16 3v3M14 6h4v9h-4zM16 15v6',
  sharpening:'M3 15h18v5H3zM7 11h10l-2 4H9z',
  // Cutters, tip down: helix lines slant one way for upcut, the other for downcut.
  twist:SHANK+'M9 10h6v9l-3 3-3-3zM9 13l6-2M9 16l6-2',
  brad:SHANK+'M9 10h6v10H9zM9 13l6-2M9 16l6-2M9 20l.5 2M12 20v2.5M15 20l-.5 2',
  forstner:'M11 2h2v12h-2zM5 14h14v5H5zM5 19l1 2M19 19l-1 2M12 19v3',
  upcut:SHANK+'M8 10h8v11H8zM8 14l8-3M8 18l8-3M8 21l8-3',
  downcut:SHANK+'M8 10h8v11H8zM8 11l8 3M8 15l8 3M8 19l8 2',
  compression:SHANK+'M8 10h8v11H8zM8 11l8 3M8 15l8 2M8 20l8-3',
  straight:SHANK+'M8 10h8v11H8zM11 10v11M13 10v11',
  saw:'M12 4a8 8 0 1 0 .01 0M12 9a3 3 0 1 0 .01 0M12 1l1 3M12 23l-1-3M1 12l3-1M23 12l-3 1M4 4l2.5 1.5M20 20l-2.5-1.5M20 4l-1.5 2.5M4 20l1.5-2.5',
  dado:'M6 4h12v16H6zM9 4v16M12 4v16M15 4v16',
};
ICONS.router=ICONS.straight;
export const toolIcon=name=>ICONS[name]??'M5 5h14v14H5z';
